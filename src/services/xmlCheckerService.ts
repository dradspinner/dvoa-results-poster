/**
 * XML Checker Service
 * 
 * Validates IOF 3.0 XML files from MeOS and OE12, detects structural issues
 * (especially group entries), and can generate a corrected copy.
 */

export type XmlSource = 'MeOS' | 'OE12' | 'Unknown';

export interface GroupIssue {
  /** Display name as currently encoded */
  currentName: string;
  /** The class/course this entry belongs to */
  className: string;
  /** What the corrected group name will be */
  correctedName: string;
  /** Why it was flagged */
  reason: string;
}

export interface XmlCheckResult {
  source: XmlSource;
  sourceDetail: string; // e.g. "SportSoftware OE12 (M) V.12.1"
  isValid: boolean;
  groupIssues: GroupIssue[];
  summary: string;
}

class XmlCheckerService {

  /**
   * Detect whether the XML was created by MeOS or OE12
   */
  detectSource(xmlContent: string): { source: XmlSource; detail: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    const resultList = doc.documentElement;
    const creator = resultList?.getAttribute('creator') || '';

    if (/meos/i.test(creator)) {
      return { source: 'MeOS', detail: creator };
    }
    if (/oe12|sportsoftware/i.test(creator)) {
      return { source: 'OE12', detail: creator };
    }

    // Fallback structural heuristics
    const hasRaceNumber = doc.querySelector('Result[raceNumber]') !== null;
    const hasPersonSex = doc.querySelector('Person[sex]') !== null;
    if (hasRaceNumber || hasPersonSex) {
      return { source: 'OE12', detail: creator || 'Detected by structure (raceNumber / Person sex)' };
    }

    return { source: 'Unknown', detail: creator || 'Could not determine source' };
  }

  /**
   * Validate XML and detect group entries that need conversion.
   * Returns a full check result.
   */
  validateXml(xmlContent: string): XmlCheckResult {
    const { source, detail } = this.detectSource(xmlContent);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        source,
        sourceDetail: detail,
        isValid: false,
        groupIssues: [],
        summary: 'XML parse error: ' + (parserError.textContent || 'unknown'),
      };
    }

    const groupIssues: GroupIssue[] = [];

    const classResults = doc.querySelectorAll('ClassResult');
    classResults.forEach(cr => {
      const className = cr.querySelector('Class > Name')?.textContent?.trim() || '?';
      const personResults = cr.querySelectorAll('PersonResult');

      personResults.forEach(pr => {
        const person = pr.querySelector('Person');
        if (!person) return;

        const family = person.querySelector('Name > Family')?.textContent?.trim() || '';
        const given = person.querySelector('Name > Given')?.textContent?.trim() || '';
        const hasBirthDate = person.querySelector('BirthDate') !== null;
        const hasId = person.querySelector('Id') !== null;
        const hasContact = person.querySelector('Contact') !== null;

        // MeOS groups already have empty Family — nothing to fix
        if (family === '' && given !== '') return;

        // Detect OE12-style groups (only relevant for OE12-sourced files)
        const issue = this.detectOE12Group(family, given, hasBirthDate, hasId, hasContact, className);
        if (issue) {
          groupIssues.push(issue);
        }
      });
    });

    const isValid = groupIssues.length === 0;
    let summary: string;
    if (isValid) {
      summary = `Source: ${source}. XML structure is valid — no group conversion needed.`;
    } else {
      summary = `Source: ${source}. Found ${groupIssues.length} entr${groupIssues.length === 1 ? 'y' : 'ies'} that appear to be groups but are encoded as individuals. Use "Create Corrected Copy" to fix the XML structure.`;
    }

    return { source, sourceDetail: detail, isValid, groupIssues, summary };
  }

  /**
   * Heuristic to detect an OE12-encoded group entry.
   * Returns a GroupIssue if it looks like a group, or null if it's an individual.
   */
  private detectOE12Group(
    family: string,
    given: string,
    hasBirthDate: boolean,
    hasId: boolean,
    hasContact: boolean,
    className: string,
  ): GroupIssue | null {
    // If the Person has BirthDate AND Id AND Contact, it's very likely a real individual
    // (even if the name contains "&" — OE12 stores family groups this way)
    if (hasBirthDate && hasId && hasContact) return null;

    // Check for strong group signals
    const reasons: string[] = [];

    // Signal 1: No BirthDate and no Id — strongest indicator in OE12
    const missingPersonData = !hasBirthDate && !hasId;

    // Signal 2: Both family and given look like full names (multi-word with capitals)
    const familyLooksLikeFull = this.looksLikeFullName(family);
    const givenLooksLikeFull = this.looksLikeFullName(given);
    if (familyLooksLikeFull && givenLooksLikeFull) {
      reasons.push('Both name fields contain what appear to be full names');
    }

    // Signal 3: Comma or ampersand in given name (without person data)
    const hasGroupSeparator = /[,&]/.test(given) || /[,&]/.test(family);
    if (hasGroupSeparator && missingPersonData) {
      reasons.push('Name contains comma or ampersand separators');
    }

    // Decision: require missing person data + at least one name signal
    if (missingPersonData && reasons.length > 0) {
      const correctedName = this.buildGroupName(given, family);
      return {
        currentName: `${given} ${family}`.trim(),
        className,
        correctedName,
        reason: reasons.join('; ') + ' (no BirthDate/Id)',
      };
    }

    // Additional: if missing person data and only has a single-word family that looks
    // like a first name, plus a multi-word given, could be "Joey" / "Jace, Wesley"
    if (missingPersonData && !hasBirthDate && !hasId) {
      // Single-word family with multi-word or separator-containing given
      const givenWords = given.split(/\s+/).length;
      if (givenWords >= 2 || /[,&]/.test(given)) {
        const correctedName = this.buildGroupName(given, family);
        reasons.push('Multiple names with no BirthDate or Id');
        return {
          currentName: `${given} ${family}`.trim(),
          className,
          correctedName,
          reason: reasons.join('; '),
        };
      }
    }

    return null;
  }

  /**
   * Check if a string looks like a full name (first + last, two+ words, capitalized).
   */
  private looksLikeFullName(name: string): boolean {
    if (!name) return false;
    const words = name.trim().split(/\s+/);
    if (words.length < 2) return false;
    // At least two words that start with uppercase
    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w));
    return capitalizedWords.length >= 2;
  }

  /**
   * Build a MeOS-style group name from OE12 given + family fields.
   * Combines all the names, cleans up separators.
   */
  private buildGroupName(given: string, family: string): string {
    // Combine all names, clean up commas/ampersands into a nice list
    const allNames = `${given}, ${family}`
      .replace(/&amp;/g, '&')
      .replace(/&/g, ',')
      .split(',')
      .map(n => n.trim())
      .filter(n => n.length > 0);
    return allNames.join(', ');
  }

  /**
   * Generate a corrected copy of the XML.
   * Transforms detected OE12 group entries to MeOS format.
   */
  generateCorrectedXml(xmlContent: string, checkResult: XmlCheckResult): string {
    if (checkResult.groupIssues.length === 0) return xmlContent;

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    // Build a set of group names for lookup
    const groupCurrentNames = new Set(
      checkResult.groupIssues.map(g => g.currentName)
    );

    // Build a map of currentName -> correctedName
    const nameMap = new Map<string, string>();
    checkResult.groupIssues.forEach(g => {
      nameMap.set(g.currentName, g.correctedName);
    });

    const classResults = doc.querySelectorAll('ClassResult');
    classResults.forEach(cr => {
      const personResults = cr.querySelectorAll('PersonResult');

      personResults.forEach(pr => {
        const person = pr.querySelector('Person');
        if (!person) return;

        const familyEl = person.querySelector('Name > Family');
        const givenEl = person.querySelector('Name > Given');
        const family = familyEl?.textContent?.trim() || '';
        const given = givenEl?.textContent?.trim() || '';
        const currentName = `${given} ${family}`.trim();

        if (!groupCurrentNames.has(currentName)) return;

        const correctedName = nameMap.get(currentName) || currentName;

        // 1. Set Family to empty, Given to corrected group name
        if (familyEl) familyEl.textContent = '';
        if (givenEl) givenEl.textContent = correctedName;

        // 2. Remove sex attribute from Person
        person.removeAttribute('sex');

        // 3. Remove <Id> from Person if present
        const personId = person.querySelector('Id');
        if (personId) person.removeChild(personId);

        // 4. Add <Nationality code="0"/> after </Name> if not present
        const nameEl = person.querySelector('Name');
        if (nameEl && !person.querySelector('Nationality')) {
          const ns = doc.documentElement.getAttribute('xmlns') || '';
          const nat = ns
            ? doc.createElementNS(ns, 'Nationality')
            : doc.createElement('Nationality');
          nat.setAttribute('code', '0');
          // Insert after Name element
          if (nameEl.nextSibling) {
            person.insertBefore(nat, nameEl.nextSibling);
          } else {
            person.appendChild(nat);
          }
        }

        // 5. Add <BibNumber>2</BibNumber> in Result if not present
        const resultEl = pr.querySelector('Result');
        if (resultEl) {
          // Remove raceNumber attribute
          resultEl.removeAttribute('raceNumber');

          if (!resultEl.querySelector('BibNumber')) {
            const ns = doc.documentElement.getAttribute('xmlns') || '';
            const bib = ns
              ? doc.createElementNS(ns, 'BibNumber')
              : doc.createElement('BibNumber');
            bib.textContent = '2';
            // Insert as first child of Result
            if (resultEl.firstChild) {
              resultEl.insertBefore(bib, resultEl.firstChild);
            } else {
              resultEl.appendChild(bib);
            }
          }
        }

        // 6. Remove Organisation for groups (MeOS groups don't have one)
        const orgEl = pr.querySelector('Organisation');
        if (orgEl) {
          pr.removeChild(orgEl);
        }
      });
    });

    // Serialize back to string
    const serializer = new XMLSerializer();
    let corrected = serializer.serializeToString(doc);

    // Clean up .000 milliseconds from timestamps for consistency
    corrected = corrected.replace(/(\d{2}:\d{2}:\d{2})\.000/g, '$1');

    return corrected;
  }
}

export const xmlCheckerService = new XmlCheckerService();
