import { useEffect, useRef } from 'react';
import type { ConfigPayload, Conversation, CouncilMessage, UserMessage } from '../types';
import { Bench } from './Bench';
import { Result } from './Result';

const EXAMPLES = [
  'Which retry strategy should a payment API use: exponential backoff or circuit breaker?',
  'Review the attached document for weak arguments and missing evidence.',
  'What is the safest way to migrate a production Postgres schema with zero downtime?',
];

function UserBubble({ msg }: { msg: UserMessage }) {
  return (
    <div className="msg user">
      <div className="bubble">
        <p className="q">{msg.question}</p>
        {msg.attachments.length > 0 && (
          <div className="bubble-attachments">
            {msg.attachments.map((a) => (
              <span key={a.path} className="attach-chip small">
                {a.kind === 'image' ? '🖼' : '📄'} {a.name}
              </span>
            ))}
          </div>
        )}
        <span className="bubble-meta">{msg.mode}</span>
      </div>
    </div>
  );
}

function CouncilBubble({ msg, question }: { msg: CouncilMessage; question: string }) {
  if (msg.status === 'running') {
    return (
      <div className="msg council">
        <div className="bubble deliberating">
          <Bench members={msg.members} progressMessage={msg.progressMessage} />
          <p className="progress-line" aria-live="polite">
            {msg.progressMessage || (msg.jobId ? `Deliberating in the background (job ${msg.jobId.slice(0, 8)}…)` : 'Convening the council…')}
          </p>
        </div>
      </div>
    );
  }
  if (msg.status === 'error') {
    return (
      <div className="msg council">
        <div className="bubble error-bubble" role="alert">
          <strong>The council could not answer.</strong>
          <p>{msg.error}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="msg council">
      <div className="bubble result-bubble">
        <Bench members={msg.members} done />
        {msg.result && <Result result={msg.result} question={question} askedAt={msg.startedAt} elapsedMs={msg.elapsedMs} />}
      </div>
    </div>
  );
}

export function Chat({ conversation, config, onExampleAsk }: {
  conversation: Conversation | null;
  config: ConfigPayload | null;
  onExampleAsk: (question: string) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const count = conversation?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count, conversation?.id]);

  if (!conversation) {
    return (
      <div className="chat empty">
        <div className="hero">
          <h1 className="hero-title">Convene the council.</h1>
          <p className="hero-sub">
            One question, {config ? `${config.council.members.length} independent models` : 'many independent models'} — local Ollama,
            your Claude and ChatGPT subscriptions — deliberating until you can see where they
            agree, where they differ, and why.
          </p>
          <div className="examples">
            {EXAMPLES.map((e) => (
              <button key={e} className="example" onClick={() => onExampleAsk(e)}>{e}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  let lastQuestion = '';
  return (
    <div className="chat">
      {conversation.messages.map((m, i) => {
        if (m.role === 'user') {
          lastQuestion = m.question;
          return <UserBubble key={i} msg={m} />;
        }
        return <CouncilBubble key={i} msg={m} question={lastQuestion} />;
      })}
      <div ref={bottom} />
    </div>
  );
}
