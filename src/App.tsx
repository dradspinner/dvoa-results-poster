import { Suspense, lazy } from 'react';
import { Layout, ConfigProvider, Spin, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import logoImage from './assets/dvoa_logo.png';
import './styles/professional.css';

const ResultsExport = lazy(() => import('./components/ResultsExport'));

const { Header, Content } = Layout;

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px', 
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          alignItems: 'center',
          height: '80px'
        }}>
          <img 
            src={logoImage} 
            alt="DVOA Logo" 
            style={{ height: '60px', marginRight: '20px' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <GlobalOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
            <Typography.Title level={3} style={{ margin: 0, color: '#1890ff' }}>
              DVOA Results Poster
            </Typography.Title>
          </div>
        </Header>
        <Content style={{ background: '#f5f5f5' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
              <Spin size="large" tip="Loading..." />
            </div>
          }>
            <ResultsExport />
          </Suspense>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
