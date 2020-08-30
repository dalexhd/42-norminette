import { workspace, ExtensionContext, window, languages, Range, Diagnostic, Uri, extensions } from "vscode";

const BASE_PATH = `${
  extensions.getExtension("dalexhd.42-norminette").extensionPath
}/packages/client/dist/img/error-gutters/`;
const MIN_SEVERITY = 3;
const ICON_SIZE = "80%";
const ICON_PATHS = [
  "error-inverse.svg",
  "warning-inverse.svg",
  "info-inverse.svg",
  "info-inverse.svg",
];

const createIcon = function (iconPath: string) {
  return window.createTextEditorDecorationType({
    gutterIconPath: `${BASE_PATH}${iconPath}`,
    gutterIconSize: ICON_SIZE,
  });
};

const icons = ICON_PATHS.map(createIcon);

const withDefault = (fallback: number, value = fallback) => value;
const withPath = (path: string) => ([file]) => file.path === path;
const withSeverity = (severity) => ([, target]) => target === severity;
const toRange = ([line]) => ({ range: new Range(line, 0, line, 0) });

const getIssues = function (diagnostics: Diagnostic[]):Map<any, any> {
  return diagnostics.reduce(
    (
      map,
      {
        severity,
        range: {
          start: { line },
        },
      }
    ) =>
      map.set(
        line,
        Math.min(severity, withDefault(MIN_SEVERITY, map.get(line)))
      ),
    new Map()
  );
};

export default function () {
  const editor = window.activeTextEditor;
  if (!editor) return;
  const diagnostics = languages.getDiagnostics(editor.document.uri);
  if (!diagnostics) return;
  const issues = [...getIssues(diagnostics)];
  icons.map((icon, iconSeverity) =>
    editor.setDecorations(
      icon,
      //@ts-ignore
      issues.filter(withSeverity(iconSeverity)).map(toRange)
    )
  );
};
