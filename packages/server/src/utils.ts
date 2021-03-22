import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  DiagnosticSeverity,
  Command
} from "vscode-languageserver";

import {
  TextDocument,
} from "vscode-languageserver-textdocument";

import { exec } from "child_process";

import { kebabCase } from "lodash";

interface NormResult {
  line: number;
  col: number;
  id: string;
  error: string;
}

export const runNorminetteProccess = async function (
  command: string
): Promise<Array<NormResult>> {
  return new Promise((resolve, reject) => {
    const errors: NormResult[] = [];
    const normDecrypted: any[] = [];
    const proc = exec(command, function (error, stdout) {
      if (error && !stdout.includes("KO!")) return reject(error.message);
      const regex = /^[\t]{1}([A-Z]+(?:_[A-Z]+)*)[\s]+\(line:[\s]+([0-9]+),[\s]+col:[\s]+([0-9]+)\):[\t]{1}(.*)/gm;
      let m;
      while ((m = regex.exec(stdout)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === regex.lastIndex) {
              regex.lastIndex++;
          }
          let errObject: NormResult = {
            line: 0,
            col: 0,
            id: '',
            error: '',
          };
          // The result can be accessed through the `m`-variable.
          m.forEach((match, groupIndex) => {
            switch (groupIndex) {
              case 1:
                errObject.id = match;
                break;
              case 2:
                errObject.line = parseInt(match) - 1;
                break;
              case 3:
                errObject.col = parseInt(match);
                break;
              case 4:
                errObject.error = match;
                break;
              default:
                break;
            }
          });
          errors.push(errObject);
      }
    });
    proc.on("close", () => {
      try {
        errors.forEach((errorObj) => {
          normDecrypted.push(errorObj);
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
        title: `Search error at norminette docs: ${actions}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        command: Command.create("View norminette", "42-norminette.searchOnNorminette", diag.codeDescription?.href)
      });
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
