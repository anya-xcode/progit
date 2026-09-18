// Languages the platform knows about. Only enabled languages can be run.
// Adding a language later means: a runner in sandbox/<id>/, enabling it here,
// and adding starter code for it on problems.
export const LANGUAGES = {
  python: { id: "python", label: "Python 3", monaco: "python", extension: "py", enabled: true },
  javascript: { id: "javascript", label: "JavaScript", monaco: "javascript", extension: "js", enabled: false },
  cpp: { id: "cpp", label: "C++17", monaco: "cpp", extension: "cpp", enabled: false },
  java: { id: "java", label: "Java", monaco: "java", extension: "java", enabled: false },
};

export function isLanguageEnabled(id) {
  return Boolean(LANGUAGES[id]?.enabled);
}

export function enabledLanguages() {
  return Object.values(LANGUAGES).filter((language) => language.enabled);
}
