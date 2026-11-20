/**
 * Results Export Service
 * 
 * Handles importing OE12 XML splits files and generating HTML results pages
 */

export interface RunnerResult {
  name: string;
  club: string;
  status: string;
  runTime: string; // seconds
  place: string;
  splits?: Split[];
  score?: number;
  penalty?: number;
  firstName?: string;
  lastName?: string;
  yearOfBirth?: number;
  sex?: string;
  cardNumber?: string;
}

export interface Split {
  controlCode: string;
  time: string; // cumulative time in 1/10 seconds
  legTime?: string; // time for this leg
}

export interface ClassResult {
  classId: string;
  className: string;
  courseId?: string;
  courseLength?: number;
  courseClimb?: number;
  courseControls?: number;
  courseName?: string;
  isScoreO?: boolean;
  runners: RunnerResult[];
}

export interface PredictedGroup {
  /** Unique key: className|firstName|lastName */
  key: string;
  /** Display name */
  name: string;
  /** Course / class name */
  className: string;
  /** Why we think it's a group */
  reason: string;
}

// Course color order as per user rules
const COURSE_COLOR_ORDER = ['white', 'yellow', 'orange', 'brown', 'green', 'red', 'blue'];

class ResultsExportService {
  /**
   * Parse OE12 XML file (IOF 3.0 format)
   */
  parseOE12XML(xmlContent: string): ClassResult[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format: ' + parserError.textContent);
    }
    
    const results: ClassResult[] = [];
    
    // Parse IOF 3.0 format - ClassResult elements
    const classResults = xmlDoc.querySelectorAll('ClassResult');
    
    classResults.forEach(classResultElement => {
      const classElement = classResultElement.querySelector('Class');
      const courseElement = classResultElement.querySelector('Course');
      
      const classId = classElement?.querySelector('Id')?.textContent?.trim() || '';
      const className = classElement?.querySelector('Name')?.textContent?.trim() || `Class ${classId}`;
      const courseLength = courseElement?.querySelector('Length')?.textContent?.trim();
      const courseClimb = courseElement?.querySelector('Climb')?.textContent?.trim();
      const courseControls = courseElement?.querySelector('NumberOfControls')?.textContent?.trim();
      const courseName = courseElement?.querySelector('Name')?.textContent?.trim();
      
      const runners: RunnerResult[] = [];
      
      // Parse all PersonResult entries in this class
      const personResults = classResultElement.querySelectorAll('PersonResult');
      
      personResults.forEach(personResult => {
        const personElement = personResult.querySelector('Person');
        const orgElement = personResult.querySelector('Organisation');
        const resultElement = personResult.querySelector('Result');
        
        if (!personElement || !resultElement) return;
        
        // Extract name
        const familyName = personElement.querySelector('Name > Family')?.textContent?.trim() || '';
        const givenName = personElement.querySelector('Name > Given')?.textContent?.trim() || '';
        const name = `${givenName} ${familyName}`.trim();
        
        // Extract club
        const club = orgElement?.querySelector('Name')?.textContent?.trim() || '';
        
        // Extract result data
        const status = resultElement.querySelector('Status')?.textContent?.trim() || 'Unknown';
        const timeText = resultElement.querySelector('Time')?.textContent?.trim() || '0';
        const position = resultElement.querySelector('Position')?.textContent?.trim() || '';
        
        // Extract additional fields
        const birthDate = personElement.querySelector('BirthDate')?.textContent?.trim();
        const sex = personElement.querySelector('sex')?.textContent || personElement.getAttribute('sex');
        const cardNumber = resultElement.querySelector('ControlCard')?.textContent?.trim();
        
        // Extract year from birth date if available
        let yearOfBirth: number | undefined;
        if (birthDate) {
          const yearMatch = birthDate.match(/^(\d{4})/);
          if (yearMatch) {
            yearOfBirth = parseInt(yearMatch[1]);
          }
        }
        
        // Parse Score-O score and penalty
        const scoreElement = resultElement.querySelector('Score[type="Score"]');
        const penaltyElement = resultElement.querySelector('Score[type="Penalty"]');
        const score = scoreElement?.textContent?.trim() ? parseInt(scoreElement.textContent.trim()) : undefined;
        const penalty = penaltyElement?.textContent?.trim() ? parseInt(penaltyElement.textContent.trim()) : undefined;
        
        // Parse splits (exclude Additional and Missing status splits)
        const splits: Split[] = [];
        const splitElements = resultElement.querySelectorAll('SplitTime');
        splitElements.forEach(split => {
          const splitStatus = split.getAttribute('status') || '';
          if (splitStatus === 'Additional' || splitStatus === 'Missing') return;
          const controlCode = split.querySelector('ControlCode')?.textContent?.trim() || '';
          const time = split.querySelector('Time')?.textContent?.trim() || '0';
          splits.push({ controlCode, time });
        });
        
        // Add finish time as final split (for calculating last leg)
        if (splits.length > 0 && status === 'OK' && timeText && timeText !== '0') {
          splits.push({ controlCode: 'F', time: timeText });
        }
        
        runners.push({
          name,
          club,
          status,
          runTime: timeText,
          place: position,
          splits: splits.length > 0 ? splits : undefined,
          score,
          penalty,
          firstName: givenName,
          lastName: familyName,
          yearOfBirth,
          sex: sex?.toUpperCase(),
          cardNumber: cardNumber || undefined,
        });
      });
      
      // Sort runners by place (finished first), then by name
      runners.sort((a, b) => {
        const placeA = parseInt(a.place) || 999;
        const placeB = parseInt(b.place) || 999;
        
        if (placeA !== placeB) {
          return placeA - placeB;
        }
        
        return a.name.localeCompare(b.name);
      });
      
      // Detect Score-O class: has Score elements in results
      const isScoreO = runners.some(r => r.score !== undefined);
      
      results.push({
        classId,
        className,
        courseLength: courseLength ? parseInt(courseLength) : undefined,
        courseClimb: courseClimb ? parseInt(courseClimb) : undefined,
        courseControls: courseControls ? parseInt(courseControls) : undefined,
        courseName,
        isScoreO,
        runners
      });
    });
    
    // Sort classes by course color order if class names contain color keywords
    results.sort((a, b) => {
      const colorA = this.extractCourseColor(a.className);
      const colorB = this.extractCourseColor(b.className);
      
      if (colorA && colorB) {
        const indexA = COURSE_COLOR_ORDER.indexOf(colorA);
        const indexB = COURSE_COLOR_ORDER.indexOf(colorB);
        
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
      }
      
      return a.className.localeCompare(b.className);
    });
    
    return results;
  }
  
  /**
   * Extract course color from class name
   */
  private extractCourseColor(className: string): string | null {
    const lowerName = className.toLowerCase();
    
    for (const color of COURSE_COLOR_ORDER) {
      if (lowerName.includes(color)) {
        return color;
      }
    }
    
    return null;
  }
  
  /**
   * Format time from seconds to HH:MM:SS format
   * IOF 3.0 XML uses seconds, not tenths of seconds
   */
  formatTime(seconds: string | number): string {
    const totalSeconds = typeof seconds === 'string' ? parseInt(seconds) : seconds;
    
    // Return dash for negative or invalid times
    if (totalSeconds < 0 || isNaN(totalSeconds)) {
      return '-';
    }
    
    // Return 0:00:00 for zero times (valid but no time elapsed)
    if (totalSeconds === 0) {
      return '0:00:00';
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Generate HTML for results by class
   */
  generateResultsByClassHTML(classResults: ClassResult[], eventName: string, eventDate: string): string {
    // Pre-process: group runners by status and calculate time behind
    classResults.forEach(classResult => {
      const finishers: RunnerResult[] = [];
      const mps: RunnerResult[] = [];
      const dnfs: RunnerResult[] = [];
      const others: RunnerResult[] = [];
      
      classResult.runners.forEach(runner => {
        if (runner.status === 'OK') {
          finishers.push(runner);
        } else if (runner.status === 'MissingPunch' || runner.status.includes('MP')) {
          mps.push(runner);
        } else if (runner.status === 'DidNotFinish' || runner.status.includes('DNF')) {
          dnfs.push(runner);
        } else {
          others.push(runner);
        }
      });
      
      // Calculate time behind for finishers
      if (finishers.length > 0) {
        const winnerTime = parseInt(finishers[0].runTime);
        finishers.forEach(runner => {
          const runnerTime = parseInt(runner.runTime);
          (runner as any).timeBehind = runnerTime - winnerTime;
        });
      }
      
      // Reorder: finishers, then MP, then DNF, then others
      (classResult as any).runnersGrouped = [
        { type: 'finishers', runners: finishers },
        { type: 'mp', runners: mps },
        { type: 'dnf', runners: dnfs },
        { type: 'other', runners: others }
      ];
    });
    
    const timestamp = new Date().toLocaleString();
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Results - ${eventName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, Helvetica, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 15px;
            font-size: 10pt;
            line-height: 1.2;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 15px 20px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 24px;
            margin-bottom: 5px;
            font-weight: 700;
        }
        
        .header .subtitle {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .header .timestamp {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 5px;
        }
        
        .content {
            padding: 15px;
        }
        
        .class-section {
            margin-bottom: 20px;
            border: 1px solid #d0d0d0;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .class-header {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            padding: 8px 12px;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .class-header .course-info {
            font-size: 12px;
            opacity: 0.95;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
        }
        
        .results-table thead {
            background: #ebffeb;
        }
        
        .results-table th {
            padding: 4px 8px;
            text-align: left;
            font-weight: normal;
            color: blue;
            border: none;
            white-space: nowrap;
        }
        
        .results-table td {
            padding: 2px 8px;
            border: none;
            white-space: nowrap;
        }
        
        .results-table tbody tr:nth-child(odd) {
            background: #ffffff;
        }
        
        .results-table tbody tr:nth-child(even) {
            background: #f9f9f9;
        }
        
        .results-table tbody tr:hover {
            background: #e8f5e9;
        }
        
        .place {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 40px;
        }
        
        .place-1 {
            color: #FFD700;
            font-size: 14pt;
        }
        
        .place-2 {
            color: #C0C0C0;
            font-size: 12pt;
        }
        
        .place-3 {
            color: #CD7F32;
            font-size: 12pt;
        }
        
        .gold-row {
            background: #fff9e6 !important;
            font-weight: bold;
        }
        
        .silver-row {
            background: #f5f5f5 !important;
        }
        
        .bronze-row {
            background: #fff5e6 !important;
        }
        
        .runner-name {
            font-weight: normal;
            font-size: 10pt;
            color: #000;
        }
        
        .club {
            color: #000;
            font-size: 10pt;
        }
        
        .time {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            font-weight: normal;
            text-align: right;
        }
        
        .status-ok {
            color: #4CAF50;
            font-weight: 600;
        }
        
        .status-mp, .status-dnf, .status-dns {
            color: #f44336;
            font-weight: 600;
        }
        
        .time-behind {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            color: #999;
            text-align: right;
        }
        
        .separator-row {
            height: 4px;
        }
        
        .group-separator {
            border: none;
            border-top: 1px solid #ccc;
            margin: 2px 0;
        }
        
        .footer {
            text-align: center;
            padding: 10px;
            background: #f5f5f5;
            color: #666;
            font-size: 9pt;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
            }
            
            .container {
                box-shadow: none;
            }
            
            .class-section {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 ${eventName}</h1>
            <div class="subtitle">Orienteering Results - ${eventDate}</div>
            <div class="timestamp">Generated: ${timestamp}</div>
        </div>
        
        <div class="content">
`;
    
    // Generate results for each class
    classResults.forEach(classResult => {
      const runnerCount = classResult.runners.length;
      const finishedCount = (classResult as any).runnersGrouped[0].runners.length;
      const courseLengthKm = classResult.courseLength ? (classResult.courseLength / 1000).toFixed(2) : '';
      
      // Score-O classes get a different table layout
      if (classResult.isScoreO) {
        html += `
            <div class="class-section">
                <div class="class-header">
                    <span>${classResult.className}</span>
                    <span class="course-info">${finishedCount} finished / ${runnerCount} started</span>
                </div>
                
                <table class="results-table">
                    <thead>
                        <tr>
                            <th style="width: 60px; text-align: center;">Place</th>
                            <th>Name</th>
                            <th style="width: 200px;">Club</th>
                            <th style="width: 80px; text-align: right;">Points</th>
                            <th style="width: 80px; text-align: right;">Penalties</th>
                            <th style="width: 100px; text-align: right;">Time</th>
                        </tr>
                    </thead>
                    <tbody>
`;
        
        // Render Score-O runners
        (classResult as any).runnersGrouped.forEach((group: any, groupIndex: number) => {
          if (group.runners.length === 0) return;
          
          if (groupIndex > 0 && group.runners.length > 0) {
            html += `
                        <tr class="separator-row">
                            <td colspan="6"><hr class="group-separator"></td>
                        </tr>
`;
          }
          
          group.runners.forEach((runner: RunnerResult) => {
            const place = parseInt(runner.place) || 0;
            const rowClass = place === 1 ? 'gold-row' : place === 2 ? 'silver-row' : place === 3 ? 'bronze-row' : '';
            const placeClass = place === 1 ? 'place-1' : place === 2 ? 'place-2' : place === 3 ? 'place-3' : '';
            
            const timeDisplay = runner.status === 'OK' ? this.formatTime(runner.runTime) : '--';
            const pointsDisplay = runner.score !== undefined ? runner.score.toString() : '';
            const penaltyDisplay = runner.penalty !== undefined ? runner.penalty.toString() : '';
            
            html += `
                        <tr class="${rowClass}">
                            <td class="place ${placeClass}">${place > 0 ? place : ''}</td>
                            <td class="runner-name">${runner.name}</td>
                            <td class="club">${runner.club || '-'}</td>
                            <td class="time">${pointsDisplay}</td>
                            <td class="time">${penaltyDisplay}</td>
                            <td class="time">${timeDisplay}</td>
                        </tr>
`;
          });
        });
      } else {
        // Standard course layout
        html += `
            <div class="class-section">
                <div class="class-header">
                    <span>${classResult.className}${courseLengthKm ? ` (${courseLengthKm}km)` : ''}</span>
                    <span class="course-info">${finishedCount} finished / ${runnerCount} started</span>
                </div>
                
                <table class="results-table">
                    <thead>
                        <tr>
                            <th style="width: 60px; text-align: center;">Place</th>
                            <th>Name</th>
                            <th style="width: 200px;">Club</th>
                            <th style="width: 100px; text-align: right;">Time</th>
                            <th style="width: 100px; text-align: right;">Behind</th>
                        </tr>
                    </thead>
                    <tbody>
`;
        
        // Render each group with separator lines
        (classResult as any).runnersGrouped.forEach((group: any, groupIndex: number) => {
          if (group.runners.length === 0) return;
          
          // Add separator line before MP and DNF groups
          if (groupIndex > 0 && group.runners.length > 0) {
            html += `
                        <tr class="separator-row">
                            <td colspan="5"><hr class="group-separator"></td>
                        </tr>
`;
          }
          
          group.runners.forEach((runner: RunnerResult) => {
            const place = parseInt(runner.place) || 0;
            const rowClass = place === 1 ? 'gold-row' : place === 2 ? 'silver-row' : place === 3 ? 'bronze-row' : '';
            const placeClass = place === 1 ? 'place-1' : place === 2 ? 'place-2' : place === 3 ? 'place-3' : '';
            
            let timeDisplay = '';
            let behindDisplay = '';
            
            if (runner.status === 'OK') {
              timeDisplay = this.formatTime(runner.runTime);
              behindDisplay = (runner as any).timeBehind === 0 ? '' : `+${this.formatTime((runner as any).timeBehind)}`;
            } else if (runner.status === 'MissingPunch' || runner.status.includes('MP')) {
              timeDisplay = this.formatTime(runner.runTime);
              behindDisplay = 'mp';
            } else if (runner.status === 'DidNotFinish' || runner.status.includes('DNF')) {
              timeDisplay = '--';
              behindDisplay = 'dnf';
            } else {
              timeDisplay = '--';
              behindDisplay = runner.status.toLowerCase();
            }
            
            html += `
                        <tr class="${rowClass}">
                            <td class="place ${placeClass}">${place > 0 ? place : ''}</td>
                            <td class="runner-name">${runner.name}</td>
                            <td class="club">${runner.club || '-'}</td>
                            <td class="time">${timeDisplay}</td>
                            <td class="time-behind">${behindDisplay}</td>
                        </tr>
`;
          });
        });
      }
      
      html += `
                    </tbody>
                </table>
            </div>
`;
    });
    
    html += `
        </div>
        
        <div class="footer">
            Results powered by DVOA Event Management System
        </div>
    </div>
</body>
</html>`;
    
    return html;
  }

  /**
   * Generate splits HTML with AttackPoint-style color coding
   */
  generateSplitsHTML(classResults: ClassResult[], eventName: string, eventDate: string): string {
    const timestamp = new Date().toLocaleString();
    
    let html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="content-type" content="text/html; charset=utf-8">
<meta name="robots" content="noindex,nofollow">

<style type="text/css">
body { color: #000000; background-color: #ffffff; 
       font: 10pt/1.2 Arial, Helvetica, sans-serif; }
table { table-layout:fixed; border-collapse: collapse; border-spacing: 0px; 
        padding: 0; margin: 0; border: none; }
th { background-color: #ebffeb; color: blue; font-weight: normal;
     border: none; white-space:nowrap; text-align: left;
     padding: 0px 3px 3px 3px; vertical-align: bottom;
     font: 10pt/1.2 Arial, Helvetica, sans-serif; }
td { padding-left: 3px; padding-right: 3px;
     border: none; overflow:hidden; vertical-align: bottom;
     white-space:nowrap; text-align: left;
     font: 10pt/1.2 Arial, Helvetica, sans-serif; }
#reporttop { background-color: #FFFFE0; font-weight: bold; padding: 0;
             border: none; margin: 0; width: 100%; }
#reporttop td { vertical-align: bottom; }
#ln { font-size: 5pt; }
tr#ev { background-color: #FFFFE0; }
tr#fix { background-color: #E0FFFF; }
#rb { text-align: right; }
#ce { text-align: center; }
#c00 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; }
#c01 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; text-align: right; }
#c02 { background-color: #ebffeb; color: black; padding: 5px 3px 2px 3px; font-weight: bold; text-align: right; }
#c10 { font-weight: bold; text-align: right; }
#c11 { font-weight: bold; text-align: right; }
#c12 { font-weight: bold; }
#c14 { font-weight: bold; text-align: right; }
.best { font-weight: bold; }
</style>

<title>${eventName} - Split time results</title>
</head>

<body>
<div id=reporttop>
<table width=1382px style="table-layout:auto;">
<tr><td><nobr>${eventName}</nobr><td id=rb><nobr>${timestamp}</nobr></tr>
<tr><td><nobr>Split time results</nobr><td id=rb style="font-weight:normal; font-size: 7pt;"><nobr>created by DVOA Event Management System</nobr></tr>
</table>
<hr>
</div>
<table id=ln><tr><td>&nbsp</td></tr></table>
`;
    
    // Generate splits for each class (skip Score-O)
    classResults.forEach(classResult => {
      if (classResult.isScoreO) return;
      
      const runnersWithSplits = classResult.runners.filter(r => r.splits && r.splits.length > 0);
      if (runnersWithSplits.length === 0) return;
      
      const courseInfo = [];
      if (classResult.courseLength) {
        courseInfo.push(`${(classResult.courseLength / 1000).toFixed(1)} km`);
      }
      const courseInfoText = courseInfo.join('  ');
      
      const numControls = runnersWithSplits[0].splits!.length;
      const controlsText = `${numControls} C`;
      
      html += `
<table id=ln><tr><td>&nbsp</td></tr></table>
<table width=1382px>
<tbody>
<tr><td id=c00 width=248px>${classResult.className}  (${runnersWithSplits.length})<td id=c01 width=168px>${courseInfoText}<td id=c02 width=82px>${controlsText}<td id="header"></td>
</tr>
</tbody>
</table>
`;
      
      // Determine how many controls and split into rows
      const controls = runnersWithSplits[0].splits!;
      const maxControlsPerRow = 14;
      const controlRows = [];
      
      for (let i = 0; i < controls.length; i += maxControlsPerRow) {
        controlRows.push(controls.slice(i, i + maxControlsPerRow));
      }
      
      // Generate control headers
      html += `
<table width=1382px>
<col width=40px>
<col width=50px>
<col width=168px>
<col width=56px>
<col width=74px>`;
      
      for (let i = 0; i < maxControlsPerRow; i++) {
        html += `\n<col width=71px>`;
      }
      
      html += `
<thead>
<tr><th id=rb>Pl</th><th id=rb>Stno</th><th>Name</th><th>Cl.</th><th id=rb>Time</th>`;
      
      for (let i = 0; i < maxControlsPerRow; i++) {
        html += `<th id=rb></th>`;
      }
      html += `<th></th></tr>
</thead>
<tbody>
</tbody>
</table>
<table width=1382px>
<col width=40px>
<col width=50px>
<col width=168px>
<col width=56px>
<col width=74px>`;
      
      for (let i = 0; i < maxControlsPerRow; i++) {
        html += `\n<col width=71px>`;
      }
      
      html += `
<tbody>
`;
      
      // Generate control code rows
      controlRows.forEach((rowControls, rowIndex) => {
        const bgClass = rowIndex % 2 === 0 ? '' : 'id=ev';
        html += `<tr ${bgClass}><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
        
        rowControls.forEach((control, idx) => {
          const controlNum = rowIndex * maxControlsPerRow + idx + 1;
          const isLast = (rowIndex === controlRows.length - 1) && (idx === rowControls.length - 1);
          const label = isLast ? 'Finish' : `${controlNum}(${control.controlCode})`;
          html += `<td id=rb>${label}`;
        });
        
        // Fill empty cells
        for (let i = rowControls.length; i < maxControlsPerRow; i++) {
          html += `<td id=rb>`;
        }
        html += `</tr>\n`;
      });
      
      html += `<tr><td id=c10><nobr>&nbsp</nobr></tr>\n`;
      
      // Calculate best and worst times for each split (leg and cumulative)
      const numSplits = runnersWithSplits[0].splits!.length;
      const bestCumulativeTimes = new Array(numSplits).fill(Infinity);
      const worstCumulativeTimes = new Array(numSplits).fill(0);
      const bestLegTimes = new Array(numSplits).fill(Infinity);
      const worstLegTimes = new Array(numSplits).fill(0);
      
      // Find best and worst times for coloring
      runnersWithSplits.forEach(runner => {
        if (runner.status !== 'OK') return;
        
        let prevTime = 0;
        runner.splits!.forEach((split, idx) => {
          const cumulativeTime = parseInt(split.time);
          const legTime = cumulativeTime - prevTime;
          
          if (cumulativeTime > 0) {
            bestCumulativeTimes[idx] = Math.min(bestCumulativeTimes[idx], cumulativeTime);
            worstCumulativeTimes[idx] = Math.max(worstCumulativeTimes[idx], cumulativeTime);
          }
          
          if (legTime > 0) {
            bestLegTimes[idx] = Math.min(bestLegTimes[idx], legTime);
            worstLegTimes[idx] = Math.max(worstLegTimes[idx], legTime);
          }
          
          prevTime = cumulativeTime;
        });
      });
      
      // Generate runner splits
      runnersWithSplits.forEach((runner, runnerIdx) => {
        const bgClass = runnerIdx % 2 === 0 ? 'id=fix' : '';
        const place = runner.place || '';
        const stno = '';
        const totalTime = runner.status === 'OK' ? this.formatTime(runner.runTime) : 
          (runner.status === 'MissingPunch' ? 'MP' : 
           runner.status === 'DidNotFinish' ? 'DNF' : 
           runner.status === 'DidNotStart' ? 'DNS' : runner.status);
        
        // Calculate leg times
        const legTimes: number[] = [];
        let prevTime = 0;
        runner.splits!.forEach(split => {
          const cumTime = parseInt(split.time);
          const legTime = cumTime - prevTime;
          legTimes.push(legTime);
          prevTime = cumTime;
        });
        
        // Row 1: Name and cumulative times (first set of controls)
        html += `<tr ${bgClass}><td id=c10>${place}<td id=c11>${stno}<td id=c12><nobr>${runner.name}</nobr><td><nobr>${classResult.className}</nobr><td id=c14>${totalTime}`;
        
        const firstRowControls = Math.min(maxControlsPerRow, runner.splits!.length);
        for (let i = 0; i < firstRowControls; i++) {
          const cumulativeTime = parseInt(runner.splits![i].time);
          const styling = runner.status === 'OK' ? 
            this.getColorForTime(cumulativeTime, bestCumulativeTimes[i], worstCumulativeTimes[i]) : 
            { color: '#000000', bold: false };
          const fontWeight = styling.bold ? 'bold' : 'normal';
          html += `<td id=rb style="font-weight: ${fontWeight}; color: ${styling.color};">${this.formatTime(cumulativeTime)}`;
        }
        for (let i = firstRowControls; i < maxControlsPerRow; i++) {
          html += `<td id=rb>`;
        }
        html += `</tr>\n`;
        
        // Row 2: Club and leg times (first set of controls)
        html += `<tr><td id=c10><td id=c11><td id=c12><nobr>${runner.club}</nobr><td><nobr></nobr><td id=c14>`;
        
        for (let i = 0; i < firstRowControls; i++) {
          const legTime = legTimes[i];
          const styling = runner.status === 'OK' ? 
            this.getColorForTime(legTime, bestLegTimes[i], worstLegTimes[i]) : 
            { color: '#000000', bold: false };
          const fontWeight = styling.bold ? 'bold' : 'normal';
          html += `<td id=rb style="font-weight: ${fontWeight}; font-style: italic; color: ${styling.color};">${this.formatTime(legTime)}`;
        }
        for (let i = firstRowControls; i < maxControlsPerRow; i++) {
          html += `<td id=rb>`;
        }
        html += `</tr>\n`;
        
        // Additional rows if more than maxControlsPerRow controls
        if (runner.splits!.length > maxControlsPerRow) {
          for (let rowIdx = 1; rowIdx < controlRows.length; rowIdx++) {
            const startIdx = rowIdx * maxControlsPerRow;
            const endIdx = Math.min(startIdx + maxControlsPerRow, runner.splits!.length);
            const bgClass2 = rowIdx % 2 === 0 ? '' : 'id=ev';
            
            // Cumulative times
            html += `<tr ${bgClass2}><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
            for (let i = startIdx; i < endIdx; i++) {
              const cumulativeTime = parseInt(runner.splits![i].time);
              const styling = runner.status === 'OK' ? 
                this.getColorForTime(cumulativeTime, bestCumulativeTimes[i], worstCumulativeTimes[i]) : 
                { color: '#000000', bold: false };
              const fontWeight = styling.bold ? 'bold' : 'normal';
              html += `<td id=rb style="font-weight: ${fontWeight}; color: ${styling.color};">${this.formatTime(cumulativeTime)}`;
            }
            for (let i = endIdx - startIdx; i < maxControlsPerRow; i++) {
              html += `<td id=rb>`;
            }
            html += `</tr>\n`;
            
            // Leg times
            html += `<tr><td id=c10><td id=c11><td id=c12><nobr></nobr><td><nobr></nobr><td id=c14>`;
            for (let i = startIdx; i < endIdx; i++) {
              const legTime = legTimes[i];
              const styling = runner.status === 'OK' ? 
                this.getColorForTime(legTime, bestLegTimes[i], worstLegTimes[i]) : 
                { color: '#000000', bold: false };
              const fontWeight = styling.bold ? 'bold' : 'normal';
              html += `<td id=rb style="font-weight: ${fontWeight}; font-style: italic; color: ${styling.color};">${this.formatTime(legTime)}`;
            }
            for (let i = endIdx - startIdx; i < maxControlsPerRow; i++) {
              html += `<td id=rb>`;
            }
            html += `</tr>\n`;
          }
        }
        
        html += `<tr><td id=c10><nobr>&nbsp</nobr></tr>\n`;
      });
      
      html += `</tbody>
</table>
`;
    });
    
    html += `
</body>
</html>`;
    
    return html;
  }

  /**
   * Get color for time based on performance (AttackPoint-style)
   */
  private getColorForTime(time: number, bestTime: number, worstTime: number): { color: string; bold: boolean } {
    if (time === bestTime) {
      return { color: '#008000', bold: true }; // Green, bold for best
    }
    
    // Calculate percentage behind best (0 = best, 1 = worst)
    const range = worstTime - bestTime;
    if (range === 0) return { color: '#000000', bold: false };
    
    const percentBehind = (time - bestTime) / range;
    
    // Color gradient: green -> yellow -> orange -> red
    if (percentBehind < 0.15) {
      return { color: '#00a000', bold: false }; // Light green
    } else if (percentBehind < 0.30) {
      return { color: '#000000', bold: false }; // Black (good)
    } else if (percentBehind < 0.50) {
      return { color: '#c08000', bold: false }; // Orange
    } else if (percentBehind < 0.75) {
      return { color: '#d04000', bold: false }; // Dark orange
    } else {
      return { color: '#c00000', bold: false }; // Red (slow)
    }
  }

  /**
   * Detect entries that our heuristic predicts are groups but have no
   * structural confirmation. These need user validation before export.
   */
  detectPredictedGroups(classResults: ClassResult[]): PredictedGroup[] {
    const predictions: PredictedGroup[] = [];
    for (const cr of classResults) {
      for (const runner of cr.runners) {
        const lastName = runner.lastName || '';
        const firstName = runner.firstName || '';

        // Skip if structurally a MeOS group (empty Family + non-empty Given)
        if (lastName === '' && firstName !== '') continue;

        // Skip if definitely solo (has birth year or sex)
        if (runner.yearOfBirth || runner.sex) continue;

        // Remaining: no YOB, no sex, non-empty lastName — predicted group, needs validation
        const key = `${cr.className}|${firstName}|${lastName}`;
        predictions.push({
          key,
          name: `${firstName} ${lastName}`.trim(),
          className: cr.className,
          reason: 'No year of birth or sex in XML data',
        });
      }
    }
    return predictions;
  }

  /** Build a unique runner key matching the format used by groupOverrides. */
  private runnerKey(className: string, runner: RunnerResult): string {
    return `${className}|${runner.firstName || ''}|${runner.lastName || ''}`;
  }

  /** Determine group/solo for a single runner, respecting user overrides. */
  private isRunnerGroup(
    runner: RunnerResult,
    className: string,
    groupOverrides?: Map<string, boolean>,
  ): boolean {
    const key = this.runnerKey(className, runner);
    if (groupOverrides?.has(key)) return groupOverrides.get(key)!;

    // Default detection:
    //  1. Empty last name with non-empty first name (MeOS structural group encoding)
    //  2. No year of birth AND no sex (heuristic — shown for validation when possible)
    const lastName = runner.lastName || '';
    const firstName = runner.firstName || '';
    return (lastName === '' && firstName !== '') ||
      (!runner.yearOfBirth && !runner.sex);
  }

  /**
   * Build flat row data used by both CSV and XLSX exports.
   * Returns typed values: numbers stay as numbers so XLSX can format them.
   */
  buildFlatRowData(
    classResults: ClassResult[],
    groupOverrides?: Map<string, boolean>,
  ): { headers: string[]; rows: (string | number | null)[][] } {
    const headers = [
      'Last Name', 'First Name', 'Year of Birth', 'Sex',
      'Club', 'Chip #', 'Group/Solo', 'Time', 'Place', 'Status', 'Course',
    ];
    const rows: (string | number | null)[][] = [];

    for (const cr of classResults) {
      for (const runner of cr.runners) {
        const groupSolo = this.isRunnerGroup(runner, cr.className, groupOverrides)
          ? 'Group' : 'Solo';

        let timeDecimal: number | null = null;
        if (runner.status === 'OK' && runner.runTime.trim()) {
          const seconds = Number(runner.runTime);
          if (Number.isFinite(seconds) && seconds >= 0) {
            timeDecimal = seconds / 86400;
          }
        }

        let place: number | null = null;
        if (runner.status === 'OK' && /^[1-9]\d*$/.test(runner.place.trim())) {
          place = parseInt(runner.place.trim());
        }

        let status = '';
        if (runner.status === 'MissingPunch') status = 'MP';
        else if (runner.status === 'DidNotFinish') status = 'DNF';
        else if (runner.status === 'DidNotStart') status = 'DNS';
        else if (runner.status !== 'OK') status = runner.status;

        rows.push([
          runner.lastName || '',
          runner.firstName || '',
          runner.yearOfBirth ?? null,
          runner.sex || '',
          runner.club || '',
          runner.cardNumber || '',
          groupSolo,
          timeDecimal,
          place,
          status,
          cr.className,
        ]);
      }
    }
    return { headers, rows };
  }

  /**
   * Generate flat CSV for spreadsheet import.
   * Time is output as an Excel-compatible decimal (fraction of a 24-hour day).
   */
  generateFlatCSV(
    classResults: ClassResult[],
    groupOverrides?: Map<string, boolean>,
  ): string {
    const { headers, rows } = this.buildFlatRowData(classResults, groupOverrides);
    const lines: string[] = [headers.join(',')];

    for (const row of rows) {
      lines.push(
        row.map(cell => {
          if (cell === null) return '';
          const str = typeof cell === 'number'
            ? (Number.isInteger(cell) ? cell.toString() : cell.toFixed(10))
            : cell;
          return this.csvEscape(str);
        }).join(',')
      );
    }
    return lines.join('\r\n');
  }

  /**
   * Escape a value for CSV: wrap in quotes if it contains comma, quote, or newline
   */
  private csvEscape(value: string): string {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

}

export const resultsExportService = new ResultsExportService();
