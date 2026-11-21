import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
const ACCEPTED_FILES = '.pdf,.txt,.md,.markdown,.json,.csv';
const MAX_SELECTED_DOCUMENTS = 25;
const CARD_TINTS = ['lavender', 'peach', 'sage', 'butter', 'lilac'];

const starterPrompts = [
  'Summarize the key ideas in my selected documents',
  'Find important dates, decisions, or action items',
  'Compare the main ideas across these documents',
];
const generalPrompts = [
  'What belongs in a good README?',
  'Explain OAuth 2.0 in simple terms',
  'How should I handle API errors?',
];

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options });
  } catch {
    throw new Error('Could not reach the server. Check that the backend is running.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('workspace-auth-required'));
    }
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 2.75 14.1 9.9 21.25 12l-7.15 2.1L12 21.25 9.9 14.1 2.75 12 9.9 9.9 12 2.75Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m19 2 .65 2.35L22 5l-2.35.65L19 8l-.65-2.35L16 5l2.35-.65L19 2Z" fill="currentColor" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M14 4v4h4M8.5 12h7M8.5 15.5h7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M10 15.75V4.25m0 0L5.5 8.75M10 4.25l4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4.25 10h11.5m0 0-4.5-4.5m4.5 4.5-4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.5V4.75m0 0L8 8.8m4-4.05 4 4.05M5 14.75v3A2.25 2.25 0 0 0 7.25 20h9.5A2.25 2.25 0 0 0 19 17.75v-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <circle cx="8.8" cy="8.8" r="5.55" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13 13 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function renderInlineCitations(text, sources, messageIndex) {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const citation = part.match(/^\[(\d+)\]$/);
    if (!citation) return part;

    const sourceIndex = Number(citation[1]) - 1;
    if (sourceIndex < 0 || sourceIndex >= sources.length) return part;
    return (
      <a
        className="inline-citation"
        href={`#evidence-${messageIndex}-${sourceIndex + 1}`}
        key={`${messageIndex}-${index}`}
        aria-label={`Jump to source ${sourceIndex + 1}`}
      >
        {part}
      </a>
    );
  });
}

function renderAnswerBlocks(message, messageIndex) {
  const sources = message.sources || [];
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = '';
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{renderInlineCitations(paragraph.join(' '), sources, messageIndex)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const ListTag = listType === 'ordered' ? 'ol' : 'ul';
    blocks.push(
      <ListTag key={`list-${blocks.length}`}>
        {list.map((item, index) => <li key={index}>{renderInlineCitations(item, sources, messageIndex)}</li>)}
      </ListTag>
    );
    list = [];
    listType = '';
  };

  for (const line of message.content.split('\n')) {
    const fence = line.trim().match(/^```([\w+-]*)/);
    if (fence) {
      flushParagraph();
      flushList();
      if (code === null) {
        code = { language: fence[1], lines: [] };
      } else {
        blocks.push(
          <div className="answer-code" key={`code-${blocks.length}`}>
            {code.language && <span className="code-language">{code.language}</span>}
            <pre><code>{code.lines.join('\n')}</code></pre>
          </div>
        );
        code = null;
      }
      continue;
    }

    if (code) {
      code.lines.push(line);
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={`h-${blocks.length}`}>{renderInlineCitations(heading[1], sources, messageIndex)}</h3>);
      continue;
    }

    const listItem = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const nextType = listItem[2] ? 'ordered' : 'unordered';
      if (list.length && listType !== nextType) flushList();
      listType = nextType;
      list.push(listItem[3]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (code) {
    blocks.push(
      <div className="answer-code" key={`code-${blocks.length}`}>
        {code.language && <span className="code-language">{code.language}</span>}
        <pre><code>{code.lines.join('\n')}</code></pre>
      </div>
    );
  }

  return blocks;
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [signedInUsername, setSignedInUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState('checking');
  const [view, setView] = useState('assistant');
  const [question, setQuestion] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchResultsFor, setSearchResultsFor] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const fileInputRef = useRef(null);

  const clearWorkspaceState = useCallback(() => {
    setView('assistant');
    setQuestion('');
    setDocuments([]);
    setSelectedDocIds(null);
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setLoading(false);
    setPendingQuestion('');
    setError('');
    setNotice('');
    setContextOpen(false);
    setDocumentSearch('');
    setSearchResults([]);
    setSearchResultsFor('');
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest('/api/auth/status')
      .then((status) => {
        if (!active) return;
        setAuthRequired(status.required);
        setAuthenticated(status.authenticated);
        setSignedInUsername(status.user?.displayName || '');
        if (!status.authenticated) clearWorkspaceState();
      })
      .catch((requestError) => {
        if (!active) return;
        setAuthRequired(true);
        setAuthenticated(false);
        setAuthError(requestError.message);
      })
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, [clearWorkspaceState]);

  useEffect(() => {
    const expireSession = () => {
      setAuthenticated(false);
      setSignedInUsername('');
      clearWorkspaceState();
      setAuthError('Your sign-in expired. Please sign in again.');
    };
    window.addEventListener('workspace-auth-required', expireSession);
    return () => window.removeEventListener('workspace-auth-required', expireSession);
  }, [clearWorkspaceState]);

  useEffect(() => {
    let active = true;
    const refreshDatabaseStatus = async () => {
      try {
        const health = await apiRequest('/health');
        if (active) setDatabaseStatus(health.database || 'disconnected');
      } catch {
        if (active) setDatabaseStatus('disconnected');
      }
    };
    refreshDatabaseStatus();
    const interval = window.setInterval(refreshDatabaseStatus, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const loadDocuments = useCallback(async () => {
    const data = await apiRequest('/api/docs');
    const nextDocuments = data.documents || [];
    const validIds = new Set(nextDocuments.map((document) => document.id));
    setDocuments(nextDocuments);
    setSelectedDocIds((current) =>
      current === null
        ? nextDocuments.slice(0, MAX_SELECTED_DOCUMENTS).map((document) => document.id)
        : current.filter((id) => validIds.has(id))
    );
    return nextDocuments;
  }, []);

  const loadConversations = useCallback(async () => {
    const data = await apiRequest('/api/conversations');
    setConversations(data.conversations || []);
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;
    Promise.allSettled([loadDocuments(), loadConversations()]).then((results) => {
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected) setError(rejected.reason.message);
    });
  }, [authenticated, loadDocuments, loadConversations]);

  useEffect(() => {
    const query = documentSearch.trim();
    if (!authenticated || view !== 'library' || !query) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await apiRequest(`/api/docs/search?q=${encodeURIComponent(query)}`);
        if (active) {
          setSearchResults(data.results || []);
          setSearchResultsFor(query);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
          setSearchResults([]);
          setSearchResultsFor(query);
        }
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authenticated, documentSearch, view]);

  const selectedIds = selectedDocIds ?? documents.map((document) => document.id);
  const filteredDocuments = documents.filter((document) =>
    document.name.toLowerCase().includes(documentSearch.trim().toLowerCase())
  );

  const startNewConversation = () => {
    if (loading) return;
    setActiveConversationId(null);
    setMessages([]);
    setPendingQuestion('');
    setQuestion('');
    setError('');
    setView('assistant');
  };

  const openConversation = async (id) => {
    if (loading) return;
    setError('');
    try {
      const data = await apiRequest(`/api/conversations/${encodeURIComponent(id)}`);
      const availableDocuments = documents.length ? documents : await loadDocuments();
      const availableIds = new Set(availableDocuments.map((document) => document.id));
      setActiveConversationId(data.conversation.id);
      setMessages(data.conversation.messages || []);
      setSelectedDocIds((data.conversation.documentIds || []).filter((documentId) => availableIds.has(documentId)));
      setQuestion('');
      setPendingQuestion('');
      setView('assistant');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (loading) return;

    const prompt = question.trim();
    if (!prompt) return;
    if (selectedIds.length > MAX_SELECTED_DOCUMENTS) {
      setError(`Select up to ${MAX_SELECTED_DOCUMENTS} documents for one question.`);
      return;
    }

    setError('');
    setNotice('');
    setPendingQuestion(prompt);
    setLoading(true);

    try {
      const data = await apiRequest('/api/docs/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          documentIds: selectedIds,
          conversationId: activeConversationId,
        }),
      });

      setActiveConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        { role: 'user', content: prompt },
        {
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
          usedDocumentContext: data.documentCount > 0,
        },
      ]);
      setQuestion('');
      setPendingQuestion('');
      try {
        await loadConversations();
      } catch {
        setNotice('Answer saved. The recent conversations list could not refresh.');
      }
    } catch (requestError) {
      setError(requestError.message);
      setPendingQuestion('');
    } finally {
      setLoading(false);
    }
  };

  const toggleDocument = (id) => {
    if (!selectedIds.includes(id) && selectedIds.length >= MAX_SELECTED_DOCUMENTS) {
      setError(`Select up to ${MAX_SELECTED_DOCUMENTS} documents for one question.`);
      return;
    }
    setSelectedDocIds(selectedIds.includes(id)
      ? selectedIds.filter((documentId) => documentId !== id)
      : [...selectedIds, id]);
  };

  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploading) return;

    setUploading(true);
    setError('');
    setNotice('');
    const uploaded = [];
    const failures = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress(`Indexing ${index + 1} of ${files.length}`);
        const body = new FormData();
        body.append('file', file);
        try {
          const data = await apiRequest('/api/docs/upload', { method: 'POST', body });
          uploaded.push(data.document);
        } catch (uploadError) {
          failures.push(`${file.name}: ${uploadError.message}`);
        }
      }

      if (uploaded.length) {
        try {
          await loadDocuments();
          setSelectedDocIds((current) => [
            ...new Set([...uploaded.map((document) => document.id), ...(current ?? [])]),
          ].slice(0, MAX_SELECTED_DOCUMENTS));
          setNotice(`${uploaded.length} ${uploaded.length === 1 ? 'document is' : 'documents are'} ready to use.`);
        } catch (refreshError) {
          setError(`Uploaded files, but could not refresh the library: ${refreshError.message}`);
        }
      }
      if (failures.length) setError((current) => [current, ...failures].filter(Boolean).join(' '));
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (document) => {
    const confirmed = window.confirm(`Remove “${document.name}” from your library?`);
    if (!confirmed) return;

    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/docs/${encodeURIComponent(document.id)}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setSelectedDocIds((current) => (current || []).filter((id) => id !== document.id));
      setNotice('Document removed from your library.');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const askAboutDocument = (document) => {
    setSelectedDocIds([document.id]);
    setActiveConversationId(null);
    setMessages([]);
    setQuestion(`Summarize “${document.name}”, highlight its key sections, and cite the supporting passages.`);
    setView('assistant');
    setError('');
  };

  const askAboutSearchResult = (result) => {
    setSelectedDocIds([result.id]);
    setActiveConversationId(null);
    setMessages([]);
    setQuestion(`Find and explain the information about “${documentSearch.trim()}” in “${result.name}”.`);
    setView('assistant');
    setError('');
  };

  const handleDocumentSearchChange = (event) => {
    const value = event.target.value;
    setDocumentSearch(value);
    setSearchResultsFor('');
    setSearchLoading(Boolean(value.trim()));
    setError('');
    if (!value.trim()) setSearchResults([]);
  };

  const handleQuestionKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError('');
    const signingUp = authMode === 'signup';
    try {
      const session = await apiRequest(`/api/auth/${signingUp ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signingUp ? { displayName, email, password } : { email, password }),
      });
      setSignedInUsername(session.user?.displayName || displayName.trim().replace(/\s+/g, ' '));
      setDisplayName('');
      setEmail('');
      setPassword('');
      clearWorkspaceState();
      setAuthenticated(true);
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
      setAuthenticated(false);
      setSignedInUsername('');
      clearWorkspaceState();
    } catch (requestError) {
      if (requestError.message.includes('session has expired')) {
        setAuthenticated(false);
        setSignedInUsername('');
        clearWorkspaceState();
        setAuthError('Your sign-in expired. Please sign in again.');
      } else {
        setError(requestError.message || 'Could not sign out everywhere. Please try again.');
      }
    } finally {
      setSigningOut(false);
    }
  };

  const selectedCount = selectedIds.length;
  const headerUsername = signedInUsername || 'Workspace';
  const headerInitial = Array.from(headerUsername)[0]?.toUpperCase() || 'W';
  const documentRows = (
    <div className="document-list">
      <div className="document-board">
        {filteredDocuments.map((document, index) => (
          <article className={`document-card tint-${CARD_TINTS[index % CARD_TINTS.length]}`} key={document.id}>
            <div className={`document-card-art art-size-${index % 3}`} aria-hidden="true">
              <span className="card-format-chip">{document.extension.replace('.', '').toUpperCase()}</span>
              <div className="art-spark art-spark-one" />
              <div className="art-spark art-spark-two" />
              <div className="paper-stack"><div className="paper-sheet"><DocumentIcon /><i /><i /><i /></div><div className="paper-shadow" /></div>
              <span className="art-caption">little notes, big ideas</span>
            </div>
            <div className="document-card-copy">
              <div className="document-card-meta"><span>{formatSize(document.size)}</span><i>·</i><span>{document.passageCount || 1} {document.passageCount === 1 ? 'note' : 'notes'}</span></div>
              <h3 title={document.name}>{document.name}</h3>
              <p className="document-card-preview">{document.preview || 'A new addition to your knowledge garden. Open it or ask the assistant to find the useful bits.'}</p>
              <div className="document-card-footer"><span>Added {formatDate(document.createdAt)}</span>
                <div className="document-actions">
                  <button type="button" className="ask-file-button" onClick={() => askAboutDocument(document)}>Ask about it</button>
                  <a className="open-file-button" href={`${API_BASE}/api/docs/${encodeURIComponent(document.id)}/file`} target="_blank" rel="noreferrer" aria-label={`Open ${document.name}`} title="Open file"><ArrowRightIcon /></a>
                  <button type="button" className="remove-file-button" onClick={() => handleDeleteDocument(document)} aria-label={`Remove ${document.name}`} title="Remove file">×</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  if (!authReady) {
    return <div className="auth-screen"><div className="auth-loading"><div className="brand-mark"><SparkleIcon /></div><span>Waking up your workspace…</span></div></div>;
  }

  if (authRequired && !authenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand"><div className="brand-mark"><SparkleIcon /></div><span>little library</span></div>
          <div className="auth-art"><div className="auth-flower">✿</div><div className="auth-orb" /><div className="auth-book"><DocumentIcon /><i /><i /><i /></div></div>
          <p className="auth-eyebrow">YOUR PRIVATE READING NOOK</p>
          <h1 id="auth-title">A cozy spot for<br />your big ideas.</h1>
          <p className="auth-copy">{authMode === 'signup' ? 'Create an account to keep your documents and conversations private.' : 'Sign in to open your personal document workspace.'}</p>
          <form className="auth-form" onSubmit={handleLogin}>
            {authMode === 'signup' && <>
              <label htmlFor="account-name">Name</label>
              <input id="account-name" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={48} placeholder="What should we call you?" required />
            </>}
            <label htmlFor="account-email">Email</label>
            <input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} placeholder="you@example.com" required />
            <label htmlFor="account-password">Password</label>
            <input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={authMode === 'signup' ? 8 : undefined} maxLength={128} required />
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button type="submit" disabled={authSubmitting || !email.trim() || !password || (authMode === 'signup' && !displayName.trim())}>{authSubmitting ? (authMode === 'signup' ? 'Creating your account…' : 'Signing you in…') : (authMode === 'signup' ? 'Create account' : 'Sign in')}<ArrowRightIcon /></button>
          </form>
          <p className="auth-switch">{authMode === 'signup' ? 'Already have an account?' : 'New to the library?'} <button type="button" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}>{authMode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><SparkleIcon /></div>
          <div className="brand-copy"><span>AI Doc</span><span>Assistant</span></div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          <button
            type="button"
            className={`sidebar-nav-item${view === 'assistant' ? ' is-active' : ''}`}
            aria-current={view === 'assistant' ? 'page' : undefined}
            onClick={() => setView('assistant')}
          >
            <span className="nav-icon"><SparkleIcon /></span>
            <span>Ask assistant</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item${view === 'library' ? ' is-active' : ''}`}
            aria-current={view === 'library' ? 'page' : undefined}
            onClick={() => setView('library')}
          >
            <span className="nav-icon"><DocumentIcon /></span>
            <span>Documents</span>
            <span className="nav-count">{documents.length}</span>
          </button>
        </nav>

        <div className="sidebar-conversations">
          <div className="sidebar-list-heading">
            <span>RECENT CHATS</span>
            <button type="button" onClick={startNewConversation} disabled={loading} aria-label="Start a new conversation" title="New chat">
              <PlusIcon />
            </button>
          </div>
          {conversations.length ? (
            <div className="recent-chat-list">
              {conversations.slice(0, 8).map((conversation) => (
                <button
                  type="button"
                  className={`recent-chat${activeConversationId === conversation.id ? ' is-current' : ''}`}
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  disabled={loading}
                  title={conversation.title}
                >
                  <span className="recent-chat-title">{conversation.title}</span>
                  <span className="recent-chat-date">{formatDate(conversation.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="no-recent-chats">Your saved conversations will appear here.</p>
          )}
        </div>

      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span><span className="breadcrumb-divider">/</span>
            <strong>{view === 'library' ? 'Documents' : 'Ask assistant'}</strong>
          </div>
          <div className="topbar-actions">
            <div className={`topbar-tag db-${databaseStatus}`} title={`MongoDB ${databaseStatus}`} aria-label={`MongoDB ${databaseStatus}`}><span className="topbar-tag-dot" /><span className="database-label">MongoDB {databaseStatus === 'connected' ? 'connected' : databaseStatus === 'checking' ? 'connecting' : 'offline'}</span></div>
            {signedInUsername && <div className="header-user" title={`Signed in as ${headerUsername}`}>
              <span className="header-user-avatar" aria-hidden="true">{headerInitial}</span>
              <span className="header-user-name">{headerUsername}</span>
            </div>}
            {authRequired && <button type="button" className="header-signout" onClick={handleLogout} disabled={signingOut} title="Sign out on every device" aria-label="Sign out on every device">{signingOut ? 'Signing out…' : <><span className="signout-full">Sign out everywhere</span><span className="signout-short">Sign out</span></>}</button>}
          </div>
        </header>

        <main className={`main-content${view === 'library' ? ' library-content' : ''}`}>
          {error && <div className="global-alert" role="alert"><span>!</span>{error}</div>}
          {notice && <div className="success-alert" role="status"><span>✓</span>{notice}</div>}

          {view === 'assistant' ? (
            <>
              <section className="welcome-section" aria-labelledby="welcome-title">
                <div className="eyebrow"><SparkleIcon /><span>YOUR DOCUMENTATION COMPANION</span></div>
                <h1 id="welcome-title">Make sense of<br /><span>the technical stuff.</span></h1>
                <p className="welcome-copy">Ask across your files, get a clear answer, and follow the evidence back to its source.</p>
              </section>

              <section className="composer-card" aria-label="Ask a question">
                <div className="context-toolbar">
                  <div className="context-wrap">
                    <button
                      type="button"
                      className={`context-button${contextOpen ? ' is-open' : ''}`}
                      onClick={() => setContextOpen((open) => !open)}
                      aria-expanded={contextOpen}
                    >
                      <DocumentIcon />
                      <span>{selectedCount ? `Using ${selectedCount} of ${documents.length} documents` : 'General knowledge'}</span>
                      <span className="context-chevron">⌄</span>
                    </button>
                    {contextOpen && (
                      <div className="context-menu">
                        <div className="context-menu-head">
                          <strong>Answer context</strong>
                          {documents.length > 0 && (
                            <button
                              type="button"
                              className="select-all-button"
                              onClick={() => setSelectedDocIds(selectedCount === Math.min(documents.length, MAX_SELECTED_DOCUMENTS) ? [] : documents.slice(0, MAX_SELECTED_DOCUMENTS).map((item) => item.id))}
                            >
                              {selectedCount === Math.min(documents.length, MAX_SELECTED_DOCUMENTS) ? 'Clear' : `Select up to ${MAX_SELECTED_DOCUMENTS}`}
                            </button>
                          )}
                        </div>
                        {documents.length ? documents.map((document) => (
                          <label className="context-option" key={document.id}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(document.id)}
                              onChange={() => toggleDocument(document.id)}
                            />
                            <span className="mini-file-icon">{document.extension.replace('.', '').slice(0, 3).toUpperCase()}</span>
                            <span className="context-option-name">{document.name}</span>
                          </label>
                        )) : (
                          <div className="context-empty">
                            <p>No documents yet.</p>
                            <button type="button" onClick={() => { setView('library'); setContextOpen(false); }}>Add documents</button>
                          </div>
                        )}
                        {documents.length > 0 && selectedCount === 0 && (
                          <p className="context-footnote">No files selected. Answers will use general knowledge.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" className="manage-context-link" onClick={() => setView('library')}>Manage files</button>
                </div>

                <form className="query-form" onSubmit={handleAsk}>
                  <label className="composer-label" htmlFor="question">What would you like to know?</label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleQuestionKeyDown}
                    placeholder="Ask about a concept, a policy, or something inside your files..."
                    rows={3}
                    maxLength={2000}
                    aria-describedby="composer-hint"
                  />
                  <div className="composer-footer">
                    <span className="composer-hint" id="composer-hint"><kbd>Enter</kbd> to ask <span className="hint-separator">·</span> <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</span>
                    <button type="submit" className="send-button" disabled={loading || !question.trim()}>
                      <span>{loading ? 'Thinking' : 'Ask assistant'}</span>
                      <span className={`send-icon${loading ? ' is-loading' : ''}`}><ArrowUpIcon /></span>
                    </button>
                  </div>
                </form>
              </section>

              {messages.length === 0 && !pendingQuestion ? (
                <section className="starter-section" aria-labelledby="starter-title">
                  <div className="section-heading">
                    <div><h2 id="starter-title">Start with a useful question</h2><p>{selectedCount ? 'These prompts will search your selected documents.' : 'Pick a prompt, add documents, or ask anything.'}</p></div>
                    <span className="ideas-label">PROMPTS</span>
                  </div>
                  <div className="prompt-grid">
                    {(selectedCount ? starterPrompts : generalPrompts).map((prompt) => (
                      <button type="button" className="prompt-card" key={prompt} onClick={() => setQuestion(prompt)}>
                        <span>{prompt}</span><ArrowRightIcon />
                      </button>
                    ))}
                  </div>
                  {documents.length === 0 && (
                    <button type="button" className="empty-library-link" onClick={() => setView('library')}>
                      <UploadIcon /> Add your first documents to get cited answers <ArrowRightIcon />
                    </button>
                  )}
                </section>
              ) : (
                <section className="conversation-section" aria-labelledby="conversation-title">
                  <div className="section-heading conversation-heading">
                    <div><h2 id="conversation-title">{activeConversationId ? 'Conversation' : 'New conversation'}</h2><p>Follow the citations to verify each answer.</p></div>
                    {messages.length > 0 && <button type="button" className="clear-button" onClick={startNewConversation} disabled={loading}>New chat</button>}
                  </div>
                  <div className="conversation-list" role="log" aria-live="polite" aria-busy={loading}>
                    {messages.map((message, index) => (
                      <article className={`message-row ${message.role === 'user' ? 'from-user' : 'from-assistant'}`} key={message._id || `${index}-${message.role}`}>
                        {message.role === 'user' ? (
                          <>
                            <div className="user-avatar" aria-hidden="true">Y</div>
                            <div className="message-content"><div className="message-meta">You</div><p>{message.content}</p></div>
                          </>
                        ) : (
                          <>
                            <div className="assistant-avatar"><SparkleIcon /></div>
                            <div className="message-content">
                              <div className="message-meta assistant-meta">AI Assistant <span className={`answer-badge${message.sources?.length ? '' : message.usedDocumentContext ? ' is-no-match' : ' is-general'}`}>{message.sources?.length ? 'EVIDENCE-BASED' : message.usedDocumentContext ? 'NO SOURCE MATCH' : 'GENERAL ANSWER'}</span></div>
                              <div className="answer-copy">{renderAnswerBlocks(message, index)}</div>
                              {message.sources?.length > 0 && (
                                <div className="evidence-list">
                                  {message.sources.map((source, sourceIndex) => (
                                    <article className="evidence-card" id={`evidence-${index}-${sourceIndex + 1}`} key={`${source.documentId}-${sourceIndex}`}>
                                      <div className="evidence-meta"><span className="evidence-number">[{sourceIndex + 1}]</span><span className="evidence-name">{source.name}</span>{source.page && <span className="evidence-page">p. {source.page}</span>}</div>
                                      <p>{source.excerpt}</p>
                                    </article>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                    {pendingQuestion && (
                      <>
                        <article className="message-row from-user"><div className="user-avatar" aria-hidden="true">Y</div><div className="message-content"><div className="message-meta">You</div><p>{pendingQuestion}</p></div></article>
                        <div className="message-row from-assistant loading-message" role="status"><div className="assistant-avatar"><SparkleIcon /></div><div className="message-content"><div className="message-meta assistant-meta">AI Assistant</div><div className="typing-indicator" aria-label="Generating an answer"><span /><span /><span /></div></div></div>
                      </>
                    )}
                  </div>
                </section>
              )}
              <footer className="content-footer"><span className="footer-sparkle"><SparkleIcon /></span><span>AI can make mistakes. Source citations help you check the details.</span></footer>
            </>
          ) : (
            <section className="library-view" aria-labelledby="library-title">
              <div className="library-heading">
                <div>
                  <div className="eyebrow"><DocumentIcon /><span>YOUR KNOWLEDGE BASE</span></div>
                  <h1 id="library-title">Your reading board</h1>
                  <p>A little place for all your big ideas. Pin in your notes, then ask anything across them.</p>
                </div>
                <div className="library-stat"><span>{documents.length}</span><small>{documents.length === 1 ? 'document' : 'documents'} indexed</small></div>
              </div>

              <div
                className={`upload-dropzone${isDragging ? ' is-dragging' : ''}${uploading ? ' is-uploading' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleUploadFiles(event.dataTransfer.files); }}
              >
                <div className="upload-icon"><UploadIcon /></div>
                <div className="upload-copy"><strong>{uploading ? uploadProgress : 'Drop documents here'}</strong><span>{uploading ? 'Extracting text and preparing citations…' : 'PDF, Markdown, text, JSON, or CSV · up to 8 MB each'}</span></div>
                <button type="button" className="browse-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? 'Indexing…' : 'Browse files'}</button>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(event) => handleUploadFiles(event.target.files)} />
              </div>

              <div className="library-toolbar">
                <div><h2>All documents</h2><p>Search, ask about, or remove a file.</p></div>
                <label className="document-search"><SearchIcon /><input type="search" placeholder="Search documents and passages" value={documentSearch} onChange={handleDocumentSearchChange} /></label>
              </div>

              {documentSearch.trim() ? (
                <div className="search-workspace">
                  <div className="search-results-heading"><div><h2>Matches in document text</h2><p>Relevant passages are ranked by keyword match.</p></div>{searchLoading && <span className="searching-label">Searching…</span>}</div>
                  {searchLoading || searchResultsFor !== documentSearch.trim() ? (
                    <div className="search-placeholder">Looking through indexed passages…</div>
                  ) : searchResults.length ? (
                    <div className="passage-results">
                      {searchResults.map((result, index) => (
                        <article className="passage-result" key={`${result.id}-${index}`}>
                          <div className="passage-result-meta"><DocumentIcon /><strong>{result.name}</strong>{result.page && <span>Page {result.page}</span>}</div>
                          <p>{result.excerpt}</p>
                          <button type="button" onClick={() => askAboutSearchResult(result)}>Ask about this passage <ArrowRightIcon /></button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="search-placeholder">No relevant passages found. Try different words or search by file name below.</div>
                  )}
                  {filteredDocuments.length > 0 && <div className="filename-matches"><div className="search-results-heading"><div><h2>Matching file names</h2></div></div>{documentRows}</div>}
                </div>
              ) : documents.length ? documentRows : (
                <div className="library-empty"><div className="empty-doc-icon"><DocumentIcon /></div><strong>Your library is ready for its first file</strong><span>Upload a guide, README, policy, or project notes to start asking questions with citations.</span><button type="button" onClick={() => fileInputRef.current?.click()}>Choose a document</button></div>
              )}
              <footer className="content-footer"><span className="footer-sparkle"><SparkleIcon /></span><span>Text is extracted for search and citation. Scanned PDFs need OCR before upload.</span></footer>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
