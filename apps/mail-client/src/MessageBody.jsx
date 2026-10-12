import React from 'react';
import {textParts, htmlLinks} from './message-links.mjs';
export default function MessageBody({message}) {
  const parts = textParts(message.body || message.snippet || '(empty message)');
  const visible = new Set(parts.filter(part => part.href).map(part => part.href));
  const links = htmlLinks(message.htmlBody).filter(link => !visible.has(link.href));
  return <>
    <div className="message-body">{parts.map((part, index) => part.href
      ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
      : <React.Fragment key={index}>{part.text}</React.Fragment>)}</div>
    {links.length > 0 && <nav aria-label="Links in this email" className="email-links"><strong>Links in this email</strong><ul>{links.map(link =>
      <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a></li>)}</ul></nav>}
  </>;
}
