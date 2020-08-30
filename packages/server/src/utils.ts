import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextDocument,
  DiagnosticSeverity,
  Command
} from "vscode-languageserver";

import { exec } from "child_process";

interface NormResult {
  line: number;
  col: number;
  fullText: string;
  errorText: string;
}

const normDecrypt = function (normLine: string): object {
  let line, col;
  const array = normLine.split(":")[0].match(/[0-9]+/g);
  if (array) [line, col] = array.map((e) => +e);
  const ob: NormResult = {
    line: (line as number) < 0 ? 0 : (line as number) - 1 || 0,
    col: col as number,
    fullText: normLine,
    errorText: normLine.split(":")[1],
  };
  return ob;
};

export const runNorminetteProccess = async function (
  command: string
): Promise<Array<NormResult>> {
  return new Promise((resolve, reject) => {
    const line: string[] = [];
    const normDecrypted: any[] = [];
    const proc = exec(command, function (error, stdout, stderr) {
      if (error) return reject(error.message);
      stdout.split("\n").forEach((text: string, index: number) => {
        if (index == 0) return;
        line.push(text);
      });
    });
    proc.on("close", (exitCode) => {
      try {
        line.pop();
        line.forEach((e) => {
          normDecrypted.push(normDecrypt(e));
        });
        resolve(normDecrypted);
      } catch (error) {
        reject(error);
      }
    });
  });
};

export const quickfix = function (
  textDocument: TextDocument,
  parms: CodeActionParams
): CodeAction[] {
  const diagnostics = parms.context.diagnostics;
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }

  const codeActions: CodeAction[] = [];
  diagnostics.forEach((diag) => {
    if (diag.severity === DiagnosticSeverity.Error) {
      let actions;
      if (diag.relatedInformation) {
        actions = diag.relatedInformation[0].message;
      } else {
        actions = diag.message;
      }
      codeActions.push({
        title: `Search error at StackOverflow: ${actions}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        command: Command.create("View stack", "42-norminette.searchOnStackOverflow", actions)
      });
      return;
    }
  });

  return codeActions;
};
