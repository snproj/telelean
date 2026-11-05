/**
 * A message from core or the host with Markdown-style backtick spans (Lean names, code): the spans render as <code>,
 * never as literal backticks. Text only (React escapes it); tooltips use `plainText` from model/format.ts instead.
 */
import { Fragment } from 'react';
import { codeSpans } from '../model/format';

export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {codeSpans(text).map((span, i) => (span.code ? <code key={i}>{span.text}</code> : <Fragment key={i}>{span.text}</Fragment>))}
    </>
  );
}
