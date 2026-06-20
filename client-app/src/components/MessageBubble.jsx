export default function MessageBubble({ message }) {
  const side = message.direction === 'inbound' ? 'inbound' : 'outbound';
  return (
    <div className={`message-row ${side}`}>
      <div className="bubble">
        <p>{message.message_body}</p>
        <small>{message.status || 'sent'} · {new Date(message.created_at || Date.now()).toLocaleString()}</small>
      </div>
    </div>
  );
}
