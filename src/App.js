import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import './App.css';
import { Analytics } from "@vercel/analytics/react"
const API_URL = (
  process.env.REACT_APP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://merciless-admiral-rag-gpt-backend.hf.space'
).replace(/\/$/, '');

const WELCOME_ORB_IMAGE = process.env.REACT_APP_WELCOME_IMAGE || `${process.env.PUBLIC_URL}/welcome-orb.svg`;

// ── TYPEWRITER HOOK ──────────────────────────────────────────────
// Uses a ref for the index to avoid stale-closure bugs that cause
// characters to be read from the wrong position (e.g. "he" instead of "the")
const useTypewriter = (text, speed = 18) => {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) { setDisplayText(''); setIsComplete(true); return; }
    indexRef.current = 0;
    setDisplayText('');
    setIsComplete(false);

    const timer = setInterval(() => {
      const i = indexRef.current;
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1)); // slice is safe — no closure over i
        indexRef.current = i + 1;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayText, isComplete };
};

// ── ASSISTANT MESSAGE ────────────────────────────────────────────
const AssistantMessage = React.memo(({ message, isLatest }) => {
  const { displayText, isComplete } = useTypewriter(
    isLatest ? message.content : null,
    16
  );
  const content = isLatest ? displayText : message.content;

  return (
    <div className="message assistant">
      <div className="message-row">
        <div className="msg-avatar">🤖</div>
        <div className="message-bubble-wrap">
          <div className="message-bubble">
            {content}
            {isLatest && !isComplete && <span className="typing-cursor" />}
          </div>

          {message.responseTime !== undefined && (
            <motion.div
              className="message-meta"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="meta-tags">
                <span className="meta-tag tag-time">
                  {(message.responseTime * 1000).toFixed(0)}ms
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── USER MESSAGE ─────────────────────────────────────────────────
const UserMessage = React.memo(({ message }) => (
  <div className="message user">
    <div className="message-row">
      <div className="msg-avatar">👤</div>
      <div className="message-bubble-wrap">
        <div className="message-bubble">{message.content}</div>
      </div>
    </div>
  </div>
));

// ── SUGGESTION CHIP ──────────────────────────────────────────────
const SuggestionChip = ({ icon, text, onClick }) => (
  <motion.button
    className="suggestion-chip"
    onClick={() => onClick(text)}
    whileHover={{ scale: 1.03, y: -2 }}
    whileTap={{ scale: 0.97 }}
  >
    <span className="chip-icon">{icon}</span>
    <span>{text}</span>
  </motion.button>
);

// ── LOADING BUBBLE ───────────────────────────────────────────────
const LoadingBubble = () => (
  <motion.div
    className="loading-msg"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
  >
    <div className="msg-avatar assistant" style={{
      width: 30, height: 30, borderRadius: 9,
      background: 'linear-gradient(135deg, #1D4ED8, #38BDF8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.875rem', flexShrink: 0,
      boxShadow: '0 0 12px rgba(56,189,248,0.2)'
    }}>🤖</div>
    <div className="loading-bubble">
      <div className="dots">
        <span /><span /><span />
      </div>
      <span className="loading-text-label">Reasoning…</span>
    </div>
  </motion.div>
);

// ── WELCOME SCREEN ───────────────────────────────────────────────
const WelcomeScreen = ({ suggestions, onSuggest }) => (
  <div className="welcome">
    <motion.div
      className="welcome-orb"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img src={WELCOME_ORB_IMAGE} alt="Assistant" className="welcome-orb-image" />
    </motion.div>

    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      Hi, I'm <span>EverydayGPT</span>
    </motion.h2>

    <motion.p
      className="welcome-desc"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      Powered by a <strong>200M parameter GPT model</strong> with retrieval-augmented
      generation. Ask me anything from my knowledge base of <strong>tons of facts</strong>!
    </motion.p>

    <motion.div
      className="model-badge"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.35 }}
    >
      GPT · 200M params · ChromaDB · RAG
    </motion.div>

    <motion.p
      className="suggestions-label"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.45 }}
    >
      Try asking
    </motion.p>

    <motion.div
      className="suggestions-grid"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      {suggestions.map((s, i) => (
        <SuggestionChip key={i} icon={s.icon} text={s.text} onClick={onSuggest} />
      ))}
    </motion.div>
  </div>
);

// ── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [theme, setTheme] = useState('dark');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = useMemo(() => [
    { icon: '🐠', text: 'How do fish breathe?' },
    { icon: '💻', text: 'What is Machine Learning?' },
    { icon: '🌍', text: 'How many continents are there on Earth?' },
    { icon: '🍓', text: 'Is a strawberry a fruit?' },
    { icon: '✈️', text: 'How do airplanes fly?' },
    { icon: '📚', text: 'Define photosynthesis' },
  ], []);

  // Health check
  useEffect(() => {
    axios.get(`${API_URL}/api/health`)
      .then(r => setHealth(r.data))
      .catch(() => {});
  }, []);

  // Auto scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Send
  const sendMessage = useCallback(async (text = input) => {
    const msg = typeof text === 'string' ? text : input;
    if (!msg.trim() || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/api/chat`, {
        message: msg,
        rag_weight: 0.7,
        max_results: 3,
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        source: data.source,
        responseTime: data.response_time,
        retrieved_facts: data.retrieved_facts,
        ts: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        error: true,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => { setMessages([]); setInput(''); };
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div className={`app ${theme}`}>
      {/* Background */}
      <div className="app-bg" />
      <div className="app-bg-grid" />

      {/* NAV */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-orb">🤖</div>
          <div className="brand-text">
            <h1>EverydayGPT</h1>
            <p>Intelligent Assistant</p>
          </div>
        </div>

        <div className="nav-center">
          {health ? (
            <div className="nav-pill">
              <div className="status-dot" />
              <span>GPT Active</span>
            </div>
          ) : (
            <div className="nav-pill">
              <span style={{ color: 'var(--text-faint)' }}>connecting…</span>
            </div>
          )}
        </div>

        <div className="nav-actions">
          {messages.length > 0 && (
            <button className="clear-nav-btn" onClick={clearChat}>
              Clear chat
            </button>
          )}
          <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <main className="main-content">
        <div className="messages-area">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                key="welcome"
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
              >
                <WelcomeScreen suggestions={suggestions} onSuggest={sendMessage} />
              </motion.div>
            ) : (
              messages.map((msg, idx) =>
                msg.role === 'user'
                  ? <UserMessage key={msg.ts} message={msg} />
                  : <AssistantMessage
                      key={msg.ts}
                      message={msg}
                      isLatest={idx === messages.length - 1}
                    />
              )
            )}

            {loading && <LoadingBubble key="loading" />}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="input-zone">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything…"
              disabled={loading}
              autoFocus
            />
            <div className="input-actions">
              <motion.button
                className={`send-btn ${loading ? 'loading' : ''}`}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {loading ? '⟳' : '↑'}
              </motion.button>
            </div>
          </div>
          {messages.length === 0 && (
            <p className="input-hint">↵ Enter to send · Shift+Enter for newline</p>
          )}
        </div>
      </main>
      <Analytics />
    </div>
  );
}