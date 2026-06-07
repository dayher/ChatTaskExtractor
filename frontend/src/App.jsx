import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// SVG Icons
const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon" style={{ color: '#25D366' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
);

const GoogleTasksIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#4285F4' }}><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
);

const GoogleDocsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#4285F4' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
);

const KeyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
);

const UploadCloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="upload-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
);

const LoadingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinner"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
);

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#8b5cf6' }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

const CrossIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

const BACKEND_URL = 'http://localhost:3001';

export default function App() {
  const [tokens, setTokens] = useState(null);
  const [taskLists, setTaskLists] = useState([]);
  const [selectedTaskList, setSelectedTaskList] = useState('new');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [docTitle, setDocTitle] = useState('Minuta de WhatsApp - Grupo de Trabajo');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  
  // Processing state
  const [status, setStatus] = useState('idle'); // idle, processing, completed, error
  const [percent, setPercent] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);

  const fileInputRef = useRef(null);
  const logContainerRef = useRef(null);

  // Load configuration and tokens on mount
  useEffect(() => {
    // 1. Check url params for redirected oauth tokens
    const urlParams = new URLSearchParams(window.location.search);
    const tokensParam = urlParams.get('tokens');
    
    let activeTokens = null;
    if (tokensParam) {
      try {
        activeTokens = JSON.parse(decodeURIComponent(tokensParam));
        localStorage.setItem('google_tokens', JSON.stringify(activeTokens));
        setTokens(activeTokens);
        // Clear tokens from URL query
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error('Error parsing tokens from URL:', e);
      }
    } else {
      const storedTokens = localStorage.getItem('google_tokens');
      if (storedTokens) {
        try {
          activeTokens = JSON.parse(storedTokens);
          setTokens(activeTokens);
        } catch (e) {
          localStorage.removeItem('google_tokens');
        }
      }
    }

    // 2. Load Gemini API Key
    const storedApiKey = localStorage.getItem('gemini_api_key');
    if (storedApiKey) {
      setGeminiApiKey(storedApiKey);
    }
  }, []);

  // Fetch Tasklists once Google token is loaded
  useEffect(() => {
    if (tokens) {
      fetchTaskLists();
    }
  }, [tokens]);

  // Scroll to bottom of logs when they update
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchTaskLists = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tasklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens })
      });
      if (response.ok) {
        const data = await response.json();
        setTaskLists(data);
        if (data.length > 0) {
          // Select default list or first
          setSelectedTaskList('new');
        }
      } else {
        // If 401/unauthorized, log out
        handleGoogleLogout();
      }
    } catch (e) {
      console.error('Error fetching task lists:', e);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/url`);
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      alert(`No se pudo obtener la URL de login de Google: ${e.message}`);
    }
  };

  const handleGoogleLogout = () => {
    localStorage.removeItem('google_tokens');
    setTokens(null);
    setTaskLists([]);
  };

  const handleApiKeyChange = (e) => {
    const value = e.target.value;
    setGeminiApiKey(value);
    localStorage.setItem('gemini_api_key', value);
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.zip')) {
        setFile(droppedFile);
      } else {
        alert('Por favor selecciona únicamente archivos en formato ZIP.');
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  // Execute processing pipeline
  const handleProcess = async () => {
    if (!file) return;
    if (!tokens) {
      alert('Por favor, inicia sesión con Google primero.');
      return;
    }
    if (!geminiApiKey) {
      alert('Por favor, introduce tu API Key de Gemini.');
      return;
    }

    setStatus('processing');
    setPercent(0);
    setLogs([]);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('tokens', JSON.stringify(tokens));
    formData.append('geminiApiKey', geminiApiKey);
    formData.append('tasklistId', selectedTaskList);
    formData.append('docTitle', docTitle);

    const addLog = (type, text) => {
      const timeStr = new Date().toLocaleTimeString('es-ES');
      setLogs((prev) => [...prev, { type, text, time: timeStr }]);
    };

    addLog('info', 'Iniciando conexión con el servidor...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers: {
          'google-tokens': JSON.stringify(tokens),
          'gemini-api-key': geminiApiKey,
          'tasklist-id': selectedTaskList,
          'doc-title': docTitle
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor: ${response.statusText}`);
      }

      // Read response stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Hold incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.percent !== undefined) {
                setPercent(data.percent);
              }
              if (data.message) {
                setCurrentMessage(data.message);
                
                // Map status types to log item styles
                let type = 'info';
                if (data.status === 'completed') type = 'success';
                if (data.status === 'error') type = 'error';
                addLog(type, data.message);
              }

              if (data.status === 'completed') {
                setStatus('completed');
                setResults({
                  docLink: data.docLink,
                  tasksCount: data.tasksCount,
                  infoCount: data.infoCount,
                  trivialCount: data.trivialCount
                });
                
                // Refresh Tasklists to see if a new list was created
                fetchTaskLists();
              } else if (data.status === 'error') {
                setStatus('error');
              }
            } catch (err) {
              console.error('Error parsing stream event:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error de procesamiento:', error);
      setStatus('error');
      addLog('error', `Error crítico: ${error.message}`);
    }
  };

  return (
    <div className="app-container">
      {/* Background visual blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <h1>
            <span className="title-gradient">Conversaciones a Acción</span>
          </h1>
          <p>Extrae tareas, transcribe audios y organiza tu equipo desde WhatsApp a Google Workspace</p>
        </div>
        
        <div className={`status-badge ${tokens ? 'connected' : 'disconnected'}`}>
          <span className="badge-dot"></span>
          <span>{tokens ? 'Conectado a Google' : 'Google Desconectado'}</span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="app-grid">
        
        {/* Left Control Panel */}
        <section className="glass-card">
          <h2 className="panel-title">
            <WhatsAppIcon /> Configuración y Archivo
          </h2>

          {/* Step 1: Gemini API Key */}
          <div className="form-group">
            <label htmlFor="geminiKey">API KEY DE GEMINI AI</label>
            <div className="input-wrapper">
              <input
                id="geminiKey"
                type="password"
                className="form-control"
                placeholder="Introducir AI key de Gemini..."
                value={geminiApiKey}
                onChange={handleApiKeyChange}
                disabled={status === 'processing'}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Se almacena localmente en tu navegador.
            </span>
          </div>

          <div className="divider" style={{ margin: '20px 0' }}></div>

          {/* Step 2: Google Authentication */}
          <div className="form-group">
            <label>INTEGRACIÓN DE GOOGLE</label>
            {!tokens ? (
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleGoogleLogin}
                disabled={status === 'processing'}
              >
                Autorizar Google Workspace
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-success)' }}>
                    Autenticado Correctamente
                  </span>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleGoogleLogout}
                    style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }}
                    disabled={status === 'processing'}
                  >
                    Salir
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="taskListSelect" style={{ fontSize: '0.8rem' }}>LISTA DE TAREAS EN GOOGLE TASKS</label>
                  <select
                    id="taskListSelect"
                    className="form-control"
                    value={selectedTaskList}
                    onChange={(e) => setSelectedTaskList(e.target.value)}
                    disabled={status === 'processing'}
                  >
                    <option value="new">🆕 Crear una nueva lista para este chat</option>
                    {taskLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        📋 {list.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="divider" style={{ margin: '20px 0' }}></div>

          {/* Step 3: Google Doc Configuration */}
          <div className="form-group">
            <label htmlFor="docTitleInput">TÍTULO DEL DOCUMENTO DE GOOGLE</label>
            <input
              id="docTitleInput"
              type="text"
              className="form-control"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              disabled={status === 'processing'}
              placeholder="Ej. Minuta Grupo de Desarrollo"
            />
          </div>

          {/* Step 4: File Uploader */}
          <div className="form-group" style={{ marginTop: '24px' }}>
            <label>ARCHIVO ZIP DE CHAT DE WHATSAPP</label>
            
            {!file ? (
              <div 
                className={`dropzone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileSelect}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <UploadCloudIcon />
                <div>
                  <p style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '4px' }}>
                    Arrastra el archivo ZIP aquí
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    o haz clic para explorar en tu equipo
                  </p>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Asegúrate de incluir los archivos multimedia al exportar el chat.
                </span>
              </div>
            ) : (
              <div className="selected-file-card">
                <div className="file-info">
                  <span className="file-icon">📁</span>
                  <div className="file-details">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="remove-file-btn" 
                  onClick={removeFile}
                  disabled={status === 'processing'}
                  title="Quitar archivo"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>

          {/* Execute Button */}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '30px', padding: '14px 20px', fontSize: '1rem' }}
            disabled={status === 'processing' || !file || !tokens || !geminiApiKey}
            onClick={handleProcess}
          >
            {status === 'processing' ? (
              <>
                <LoadingIcon />
                Procesando conversación...
              </>
            ) : (
              'Comenzar Extracción'
            )}
          </button>
        </section>

        {/* Right Status & Dashboard Panel */}
        <section className="glass-card status-panel-wrapper">
          
          {/* IDLE state */}
          {status === 'idle' && (
            <div className="idle-placeholder">
              <div className="placeholder-illustration">🎯</div>
              <h3>Listo para Procesar</h3>
              <p>
                Configura tu clave de Gemini, inicia sesión en Google Workspace, carga el archivo zip de conversación de WhatsApp y haz clic en comenzar para automatizar la extracción de tareas y documentación.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginTop: '20px', textAlign: 'left' }}>
                <div className="task-item">
                  <span style={{ fontSize: '1.2rem' }}>🔑</span>
                  <div className="task-body">
                    <span className="task-title" style={{ fontWeight: '600' }}>1. Configura Gemini</span>
                    <span className="task-metadata">Para agrupar, transcribir audios, categorizar y resumir contenido.</span>
                  </div>
                </div>
                
                <div className="task-item">
                  <span style={{ fontSize: '1.2rem' }}>🌐</span>
                  <div className="task-body">
                    <span className="task-title" style={{ fontWeight: '600' }}>2. Conéctate con Google</span>
                    <span className="task-metadata">Para guardar las tareas e insertar la minuta de información con imágenes.</span>
                  </div>
                </div>

                <div className="task-item">
                  <span style={{ fontSize: '1.2rem' }}>📦</span>
                  <div className="task-body">
                    <span className="task-title" style={{ fontWeight: '600' }}>3. Sube el ZIP de WhatsApp</span>
                    <span className="task-metadata">Exporta tu chat grupal (con archivos multimedia incluidos) de tu móvil.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROCESSING state */}
          {status === 'processing' && (
            <div className="processing-card">
              <h2 className="panel-title">
                <LoadingIcon /> Procesando Datos
              </h2>
              
              <div className="progress-header">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {currentMessage || 'Iniciando pipeline...'}
                </span>
                <span className="progress-percentage">{percent}%</span>
              </div>

              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${percent}%` }}
                ></div>
              </div>

              <div className="section-label" style={{ marginTop: '10px' }}>Terminal de Logs</div>
              <div className="log-container" ref={logContainerRef}>
                {logs.map((log, index) => (
                  <div key={index} className={`log-item ${log.type}`}>
                    <span className="log-time">[{log.time}]</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ERROR state */}
          {status === 'error' && (
            <div className="processing-card">
              <h2 className="panel-title" style={{ color: 'var(--accent-danger)' }}>
                <span style={{ color: 'var(--accent-danger)' }}><CrossIcon /></span> Ocurrió un error
              </h2>
              
              <div className="log-container" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', height: '280px' }} ref={logContainerRef}>
                {logs.map((log, index) => (
                  <div key={index} className={`log-item ${log.type}`}>
                    <span className="log-time">[{log.time}]</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>

              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ marginTop: '20px' }}
                onClick={() => setStatus('idle')}
              >
                Volver a configurar
              </button>
            </div>
          )}

          {/* COMPLETED state */}
          {status === 'completed' && results && (
            <div className="results-card">
              <div className="success-header">
                <div className="success-icon">
                  <CheckIcon />
                </div>
                <div className="success-text">
                  <h3>¡Conversación Procesada!</h3>
                  <p>Las tareas y la información han sido sincronizadas.</p>
                </div>
              </div>

              {/* Statistics */}
              <div className="results-stats">
                <div className="stat-box tasks">
                  <span className="stat-number">{results.tasksCount}</span>
                  <span className="stat-label">Tareas Creadas</span>
                </div>
                
                <div className="stat-box info">
                  <span className="stat-number">{results.infoCount}</span>
                  <span className="stat-label">Notas de Info</span>
                </div>

                <div className="stat-box trivial">
                  <span className="stat-number">{results.trivialCount}</span>
                  <span className="stat-label">Chats triviales omitidos</span>
                </div>
              </div>

              {/* Google Doc Link */}
              <div style={{ margin: '10px 0' }}>
                <a 
                  href={results.docLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-primary btn-open-doc"
                  style={{ width: '100%', textDecoration: 'none' }}
                >
                  <GoogleDocsIcon /> Abrir Minuta en Google Docs
                </a>
              </div>

              {/* Created Tasks Preview */}
              <div className="tasks-list-section">
                <span className="section-label">Tareas creadas en Google Tasks:</span>
                
                {results.tasksCount > 0 ? (
                  <div className="tasks-list">
                    {logs
                      .filter(l => l.text.includes('Creando tarea:') || l.text.includes('tarea en Google Tasks:'))
                      .map((log, index) => {
                        // Extract task name if printed in log
                        const title = log.text.replace('Creando tarea: ', '').replace('tarea en Google Tasks:', '');
                        return (
                          <div className="task-item" key={index}>
                            <span className="task-checkbox"><GoogleTasksIcon /></span>
                            <div className="task-body">
                              <span className="task-title">{title}</span>
                              <span className="task-metadata">Sincronizada con éxito</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    No se identificaron tareas accionables en esta conversación.
                  </p>
                )}
              </div>

              <div className="divider"></div>

              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setStatus('idle')}
              >
                Procesar otro archivo ZIP
              </button>
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
