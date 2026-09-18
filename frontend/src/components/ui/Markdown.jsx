import ReactMarkdown from "react-markdown";

const components = {
  a: ({ node, ...props }) => <a target="_blank" rel="noreferrer" {...props} />,
};

// Renders problem statements. Raw HTML in the source is not rendered.
export default function Markdown({ children, className = "" }) {
  if (!children) return null;
  return (
    <div className={`prose-dsa ${className}`}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
