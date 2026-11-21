import React, { useState } from 'react';
import { Card, Button, Space, Alert, Typography, Progress, message, List, Tag } from 'antd';
import { UploadOutlined, FileTextOutlined, CheckCircleOutlined, WarningOutlined, GlobalOutlined, ToolOutlined, TableOutlined, FileExcelOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { resultsExportService, ClassResult, PredictedGroup } from '../services/resultsExportService';
import { xmlCheckerService, XmlCheckResult } from '../services/xmlCheckerService';

const { Title, Text, Paragraph } = Typography;

interface GenerationResult {
  success: boolean;
  resultsPath?: string;
  splitsPath?: string;
  flatCsvPath?: string;
  xlsxPath?: string;
  error?: string;
}

const ResultsExport: React.FC = () => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [eventInfo, setEventInfo] = useState<{ name: string; date: string } | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  
  // XML checker state
  const [xmlCheckResult, setXmlCheckResult] = useState<XmlCheckResult | null>(null);
  const [correctingXml, setCorrectingXml] = useState(false);

  // Group prediction state
  const [predictedGroups, setPredictedGroups] = useState<PredictedGroup[]>([]);
  const [groupOverrides, setGroupOverrides] = useState<Map<string, boolean>>(new Map());
  const [parsedResults, setParsedResults] = useState<ClassResult[]>([]);

  const handleBrowseFile = async () => {
    if (!window.electronAPI) {
      message.error('File dialog only available in Electron app');
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select Results File',
        filters: [
          { name: 'Results Files', extensions: ['xml', 'csv'] },
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        const selectedFileName = selectedPath.split(/[\\/]/).pop() || '';
        
        // Read file content
        const fileResult = await window.electronAPI.readFile(selectedPath);
        
        if (fileResult.success && fileResult.content) {
          setFilePath(selectedPath);
          setFileName(selectedFileName);
          setFileContent(fileResult.content);
          
          // Create a dummy file list entry for display
          setFileList([{
            uid: '-1',
            name: selectedFileName,
            status: 'done',
            url: selectedPath
          } as any]);
          
          setResult(null);
          const isXml = fileResult.content.trimStart().startsWith('<?xml') || fileResult.content.trimStart().startsWith('<');

          // Extract event info
          if (isXml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(fileResult.content, 'text/xml');
            const eventName = xmlDoc.querySelector('Event > Name')?.textContent?.trim() || 'Event Results';
            const eventDate = xmlDoc.querySelector('Event > StartTime > Date')?.textContent?.trim() || new Date().toISOString().split('T')[0];
            setEventInfo({ name: eventName, date: eventDate });

            // XML checker only applies to XML files
            const checkResult = xmlCheckerService.validateXml(fileResult.content);
            setXmlCheckResult(checkResult);
          } else {
            // For CSV, derive event name from filename
            const baseName = selectedFileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
            setEventInfo({ name: baseName, date: new Date().toISOString().split('T')[0] });
            setXmlCheckResult(null);
          }

          // Parse results (auto-detects format)
          const parsed = resultsExportService.parseAuto(fileResult.content);
          setParsedResults(parsed);
          const predictions = resultsExportService.detectPredictedGroups(parsed);
          setPredictedGroups(predictions);
          // Default all predictions to Group
          const defaults = new Map<string, boolean>();
          predictions.forEach(p => defaults.set(p.key, true));
          setGroupOverrides(defaults);
          
          message.success(`File loaded: ${selectedFileName}`);
        } else {
          message.error('Failed to read file');
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      message.error('Failed to select file');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateHTML = async () => {
    if (fileList.length === 0 || !fileContent) {
      message.warning('Please select an XML file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Parse XML using stored content
      const classResults = resultsExportService.parseAuto(fileContent);

      if (!eventInfo) {
        throw new Error('Event information not loaded');
      }

      // Generate Results HTML
      const resultsHtml = resultsExportService.generateResultsByClassHTML(
        classResults,
        eventInfo.name,
        eventInfo.date
      );

      // Generate Splits HTML
      const splitsHtml = resultsExportService.generateSplitsHTML(
        classResults,
        eventInfo.name,
        eventInfo.date
      );

      // Determine output paths (same directory as input file)
      const basePath = filePath.replace(/\.(xml|csv)$/i, '');
      const resultsOutputPath = basePath + '_results.html';
      const splitsOutputPath = basePath + '_splits.html';

      // Save files using Electron API
      if (window.electron) {
        const resultsSaved = await window.electron.saveFile(resultsOutputPath, resultsHtml);
        const splitsSaved = await window.electron.saveFile(splitsOutputPath, splitsHtml);
        
        if (resultsSaved && splitsSaved) {
          setResult({
            success: true,
            resultsPath: resultsOutputPath,
            splitsPath: splitsOutputPath
          });
          message.success('Results and Splits HTML generated successfully!');
        } else {
          throw new Error('Failed to save one or more files');
        }
      } else {
        // Fallback for browser: download files
        // Download results
        const resultsBlob = new Blob([resultsHtml], { type: 'text/html' });
        const resultsUrl = URL.createObjectURL(resultsBlob);
        const resultsLink = document.createElement('a');
        resultsLink.href = resultsUrl;
        resultsLink.download = fileName.replace(/\.xml$/i, '_results.html');
        document.body.appendChild(resultsLink);
        resultsLink.click();
        document.body.removeChild(resultsLink);
        URL.revokeObjectURL(resultsUrl);

        // Download splits
        const splitsBlob = new Blob([splitsHtml], { type: 'text/html' });
        const splitsUrl = URL.createObjectURL(splitsBlob);
        const splitsLink = document.createElement('a');
        splitsLink.href = splitsUrl;
        splitsLink.download = fileName.replace(/\.xml$/i, '_splits.html');
        document.body.appendChild(splitsLink);
        splitsLink.click();
        document.body.removeChild(splitsLink);
        URL.revokeObjectURL(splitsUrl);

        setResult({
          success: true,
          resultsPath: resultsLink.download,
          splitsPath: splitsLink.download
        });
        message.success('Results and Splits HTML downloaded!');
      }
    } catch (error) {
      console.error('Error generating HTML:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate HTML'
      });
      message.error('Failed to generate results HTML');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenResults = () => {
    if (result?.resultsPath && window.electron) {
      window.electron.openExternal(result.resultsPath);
    }
  };

  const handleOpenSplits = () => {
    if (result?.splitsPath && window.electron) {
      window.electron.openExternal(result.splitsPath);
    }
  };

  const handleGenerateFlatCSV = async () => {
    if (fileList.length === 0 || !fileContent) {
      message.warning('Please select an XML file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const results = parsedResults.length > 0 ? parsedResults : resultsExportService.parseOE12XML(fileContent);
      const csvContent = resultsExportService.generateFlatCSV(results, groupOverrides);

      const flatCsvFileName = fileName.replace(/\.xml$/i, '').replace(/-/g, '_') + '_flat.csv';
      const flatCsvOutputPath = filePath.replace(/[^\\/]+$/, () => flatCsvFileName);

      const api = window.electron || window.electronAPI;
      if (api) {
        const saved = await api.saveFile(flatCsvOutputPath, csvContent);
        if (saved.success) {
          setResult({ success: true, flatCsvPath: flatCsvOutputPath });
          message.success('Flat CSV generated successfully!');
        } else {
          throw new Error(saved.error || 'Failed to save flat CSV file');
        }
      } else {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = flatCsvFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setResult({ success: true, flatCsvPath: link.download });
        message.success('Flat CSV downloaded!');
      }
    } catch (error) {
      console.error('Error generating flat CSV:', error);
      setResult({ success: false, error: error instanceof Error ? error.message : 'Failed to generate flat CSV' });
      message.error('Failed to generate flat CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateXLSX = async () => {
    if (fileList.length === 0 || !fileContent) {
      message.warning('Please select an XML file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const results = parsedResults.length > 0 ? parsedResults : resultsExportService.parseOE12XML(fileContent);
      const { headers, rows } = resultsExportService.buildFlatRowData(results, groupOverrides);

      const XLSX = await import('xlsx');
      const wsData = [headers, ...rows.map(row => row.map(cell => cell === null ? '' : cell))];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Format the Time column (index 7) as [h]:mm:ss for rows with numeric values
      const timeCol = 7;
      for (let r = 1; r <= rows.length; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c: timeCol });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '[h]:mm:ss';
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      const xlsxFileName = fileName.replace(/\.xml$/i, '').replace(/-/g, '_') + '_flat.xlsx';
      const xlsxOutputPath = filePath.replace(/[^\\/]+$/, () => xlsxFileName);

      const api = window.electronAPI || window.electron;
      if (api?.saveBinaryFile) {
        const saved = await api.saveBinaryFile(xlsxOutputPath, base64);
        if (saved.success) {
          setResult({ success: true, xlsxPath: xlsxOutputPath });
          message.success('XLSX generated successfully!');
        } else {
          throw new Error(saved.error || 'Failed to save XLSX file');
        }
      } else {
        // Browser fallback
        const byteStr = atob(base64);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = xlsxFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setResult({ success: true, xlsxPath: link.download });
        message.success('XLSX downloaded!');
      }
    } catch (error) {
      console.error('Error generating XLSX:', error);
      setResult({ success: false, error: error instanceof Error ? error.message : 'Failed to generate XLSX' });
      message.error('Failed to generate XLSX');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFlatCSV = () => {
    const api = window.electron || window.electronAPI;
    if (result?.flatCsvPath && api) api.openExternal(result.flatCsvPath);
  };

  const handleOpenXLSX = () => {
    const api = window.electron || window.electronAPI;
    if (result?.xlsxPath && api) api.openExternal(result.xlsxPath);
  };

  const handleCreateCorrectedXml = async () => {
    if (!xmlCheckResult || !fileContent) return;

    setCorrectingXml(true);
    try {
      const correctedContent = xmlCheckerService.generateCorrectedXml(fileContent, xmlCheckResult);

      // Build corrected file path
      const correctedPath = filePath.replace(/\.xml$/i, '_corrected.xml');
      const correctedFileName = correctedPath.split(/[\\/]/).pop() || '';

      // Save the corrected file
      if (window.electron) {
        const saved = await window.electron.saveFile(correctedPath, correctedContent);
        if (!saved) throw new Error('Failed to save corrected file');
      } else if (window.electronAPI) {
        const saved = await window.electronAPI.saveFile(correctedPath, correctedContent);
        if (!saved.success) throw new Error('Failed to save corrected file');
      } else {
        // Browser fallback: download
        const blob = new Blob([correctedContent], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = correctedFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      // Reload corrected content as active file
      setFileContent(correctedContent);
      setFilePath(correctedPath);
      setFileName(correctedFileName);
      setFileList([{ uid: '-1', name: correctedFileName, status: 'done', url: correctedPath } as any]);

      // Re-run checker on corrected content
      const newCheck = xmlCheckerService.validateXml(correctedContent);
      setXmlCheckResult(newCheck);

      message.success(`Corrected XML saved: ${correctedFileName}`);
    } catch (error) {
      console.error('Error creating corrected XML:', error);
      message.error('Failed to create corrected XML');
    } finally {
      setCorrectingXml(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Header */}
          <div>
            <Title level={2}>
              <GlobalOutlined /> Post Results Online
            </Title>
            <Paragraph type="secondary">
              Import MeOS results (IOF 3.0 XML or OE2003 CSV) and generate professional HTML pages for your club website. CSV includes sex and year of birth.
            </Paragraph>
          </div>

          {/* File Upload */}
          <Card type="inner" title="1. Select Results File (XML or CSV)">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                icon={<UploadOutlined />} 
                onClick={handleBrowseFile}
                disabled={loading}
                size="large"
              >
                Browse for XML or CSV File
              </Button>
              
              {fileList.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <Text strong>Selected file: </Text>
                  <Text code>{fileName}</Text>
                  <Button 
                    type="link" 
                    size="small"
                    onClick={() => {
                      setFileList([]);
                      setEventInfo(null);
                      setResult(null);
                      setFileContent('');
                      setFileName('');
                      setFilePath('');
                      setXmlCheckResult(null);
                      setPredictedGroups([]);
                      setGroupOverrides(new Map());
                      setParsedResults([]);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </Space>

            {eventInfo && (
              <Alert
                message="Event Information Detected"
                description={
                  <div>
                    <Text strong>Event: </Text>
                    <Text>{eventInfo.name}</Text>
                    <br />
                    <Text strong>Date: </Text>
                    <Text>{eventInfo.date}</Text>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginTop: '16px' }}
              />
            )}
          </Card>

          {/* XML Check Results */}
          {xmlCheckResult && (
            <Card type="inner" title="XML Compatibility Check">
              {xmlCheckResult.isValid ? (
                <Alert
                  message="XML Valid"
                  description={xmlCheckResult.summary}
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    message="Issues Detected"
                    description={xmlCheckResult.summary}
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                  />
                  <List
                    size="small"
                    bordered
                    dataSource={xmlCheckResult.groupIssues}
                    renderItem={(issue) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <span>
                              <Tag color="orange">{issue.className}</Tag>
                              <Text strong>{issue.currentName}</Text>
                              <Text type="secondary"> → </Text>
                              <Text code>{issue.correctedName}</Text>
                            </span>
                          }
                          description={<Text type="secondary">{issue.reason}</Text>}
                        />
                      </List.Item>
                    )}
                  />
                  <Button
                    type="primary"
                    icon={<ToolOutlined />}
                    onClick={handleCreateCorrectedXml}
                    loading={correctingXml}
                    block
                  >
                    Create Corrected Copy
                  </Button>
                </Space>
              )}
            </Card>
          )}

          {/* Group Validation */}
          {predictedGroups.length > 0 && (
            <Card type="inner" title="Group / Solo Validation">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Alert
                  message={`${predictedGroups.length} entr${predictedGroups.length === 1 ? 'y' : 'ies'} predicted as Group`}
                  description="These entries have no year of birth or sex in the XML. Please confirm whether each is a Group or Solo individual."
                  type="info"
                  showIcon
                  icon={<WarningOutlined />}
                />
                <Space wrap>
                  <Button
                    size="small"
                    icon={<TeamOutlined />}
                    onClick={() => {
                      const updated = new Map(groupOverrides);
                      predictedGroups.forEach(p => updated.set(p.key, true));
                      setGroupOverrides(updated);
                    }}
                  >
                    All Group
                  </Button>
                  <Button
                    size="small"
                    icon={<UserOutlined />}
                    onClick={() => {
                      const updated = new Map(groupOverrides);
                      predictedGroups.forEach(p => updated.set(p.key, false));
                      setGroupOverrides(updated);
                    }}
                  >
                    All Solo
                  </Button>
                </Space>
                <List
                  size="small"
                  bordered
                  dataSource={predictedGroups}
                  renderItem={(pg) => {
                    const isGroup = groupOverrides.get(pg.key) ?? true;
                    return (
                      <List.Item
                        actions={[
                          <Button
                            key="toggle"
                            size="small"
                            type={isGroup ? 'primary' : 'default'}
                            icon={isGroup ? <TeamOutlined /> : <UserOutlined />}
                            onClick={() => {
                              const updated = new Map(groupOverrides);
                              updated.set(pg.key, !isGroup);
                              setGroupOverrides(updated);
                            }}
                          >
                            {isGroup ? 'Group' : 'Solo'}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <span>
                              <Tag color="blue">{pg.className}</Tag>
                              <Text strong>{pg.name}</Text>
                              {' '}
                              <Tag color={isGroup ? 'orange' : 'green'}>{isGroup ? 'Group' : 'Solo'}</Tag>
                            </span>
                          }
                          description={<Text type="secondary">{pg.reason}</Text>}
                        />
                      </List.Item>
                    );
                  }}
                />
              </Space>
            </Card>
          )}

          {/* Generate Button */}
          <Card type="inner" title="2. Generate Outputs">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* HTML Generation */}
              <div>
                <Paragraph strong>HTML Results & Splits</Paragraph>
                <Paragraph type="secondary">
                  Two HTML files will be generated in the same directory as the XML file:
                  <ul style={{ paddingLeft: '20px', marginTop: '8px', marginBottom: 0 }}>
                    <li><strong>_results.html</strong> - Professional results with rankings and times</li>
                    <li><strong>_splits.html</strong> - Detailed splits analysis with color coding</li>
                  </ul>
                </Paragraph>

                <Button
                  type="primary"
                  size="large"
                  icon={<FileTextOutlined />}
                  onClick={handleGenerateHTML}
                  loading={loading}
                  disabled={fileList.length === 0 || !eventInfo}
                  block
                >
                  Generate Results & Splits HTML
                </Button>
              </div>

              {/* Flat Results Export */}
              <div>
                <Paragraph strong>Flat Results Export</Paragraph>
                <Paragraph type="secondary">
                  Export results with: Last Name, First Name, Year of Birth, Sex, Club,
                  Group/Solo, Finishing Time, Place, Status, and Course.
                </Paragraph>

                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Button
                    type="default"
                    size="large"
                    icon={<TableOutlined />}
                    onClick={handleGenerateFlatCSV}
                    loading={loading}
                    disabled={fileList.length === 0 || !eventInfo}
                    block
                  >
                    Export as CSV
                  </Button>
                  <Button
                    type="default"
                    size="large"
                    icon={<FileExcelOutlined />}
                    onClick={handleGenerateXLSX}
                    loading={loading}
                    disabled={fileList.length === 0 || !eventInfo}
                    block
                  >
                    Export as XLSX
                  </Button>
                </Space>
              </div>

              {loading && (
                <Progress percent={100} status="active" showInfo={false} />
              )}
            </Space>
          </Card>

          {/* Results */}
          {result && (
            <Card
              type="inner"
              title="Generation Complete"
              style={{
                borderColor: result.success ? '#52c41a' : '#ff4d4f'
              }}
            >
              {result.success ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Alert
                    message="Success!"
                    description={
                      <div>
                        {result.resultsPath && (
                          <>
                            <Text strong>Results HTML:</Text>
                            <br />
                            <Text code>{result.resultsPath}</Text>
                            <br />
                            <br />
                          </>
                        )}
                        {result.splitsPath && (
                          <>
                            <Text strong>Splits HTML:</Text>
                            <br />
                            <Text code>{result.splitsPath}</Text>
                            <br />
                            <br />
                          </>
                        )}
                        {result.flatCsvPath && (
                          <>
                            <Text strong>Flat Results CSV:</Text>
                            <br />
                            <Text code>{result.flatCsvPath}</Text>
                            <br />
                            <br />
                          </>
                        )}
                        {result.xlsxPath && (
                          <>
                            <Text strong>Results XLSX:</Text>
                            <br />
                            <Text code>{result.xlsxPath}</Text>
                          </>
                        )}
                      </div>
                    }
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                  />

                  <Space>
                    {result.resultsPath && (
                      <Button type="primary" onClick={handleOpenResults}>
                        Open Results
                      </Button>
                    )}
                    {result.splitsPath && (
                      <Button type="default" onClick={handleOpenSplits}>
                        Open Splits
                      </Button>
                    )}
                    {result.flatCsvPath && (
                      <Button type="default" onClick={handleOpenFlatCSV}>
                        Open CSV
                      </Button>
                    )}
                    {result.xlsxPath && (
                      <Button type="default" onClick={handleOpenXLSX}>
                        Open XLSX
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setFileList([]);
                        setEventInfo(null);
                        setResult(null);
                        setFileContent('');
                        setFileName('');
                        setFilePath('');
                        setXmlCheckResult(null);
                        setPredictedGroups([]);
                        setGroupOverrides(new Map());
                        setParsedResults([]);
                      }}
                    >
                      Generate Another
                    </Button>
                  </Space>
                </Space>
              ) : (
                <Alert
                  message="Error"
                  description={result.error}
                  type="error"
                  showIcon
                />
              )}
            </Card>
          )}

          {/* Features Info */}
          <Card type="inner" title="Features" size="small">
            <Paragraph strong>Results HTML:</Paragraph>
            <ul style={{ paddingLeft: '20px', margin: '0 0 12px 0' }}>
              <li>Automatic course color sorting (White → Yellow → Orange → Brown → Green → Red → Blue)</li>
              <li>Professional styling with gold/silver/bronze highlights for top 3</li>
              <li>Time behind calculation for all finishers</li>
              <li>Proper grouping: Finishers → MP → DNF</li>
              <li>Mobile responsive design</li>
            </ul>
            <Paragraph strong>Splits HTML:</Paragraph>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              <li>AttackPoint-style color coding (green=fast, red=slow)</li>
              <li>Bold highlights for fastest splits</li>
              <li>Cumulative and leg times displayed</li>
              <li>Easy identification of time gains/losses</li>
            </ul>
          </Card>
        </Space>
      </Card>

    </div>
  );
};

export default ResultsExport;
