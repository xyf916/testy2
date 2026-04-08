import * as vscode from 'vscode';
import { FRContent } from './frDocumentService';

export class FRWebViewPanel {
    public static currentPanel: FRWebViewPanel | undefined;
    public static readonly viewType = 'frDocument';

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, frNumber: string, content: FRContent) {
        // Open in side panel (beside the current editor)
        if (FRWebViewPanel.currentPanel) {
            FRWebViewPanel.currentPanel._update(frNumber, content);
            FRWebViewPanel.currentPanel._panel.reveal(undefined, true);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            FRWebViewPanel.viewType,
            `FR${frNumber}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        FRWebViewPanel.currentPanel = new FRWebViewPanel(panel, extensionUri, frNumber, content);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        frNumber: string,
        content: FRContent
    ) {
        this._panel = panel;
        this._update(frNumber, content);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        FRWebViewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update(frNumber: string, content: FRContent) {
        this._panel.title = `FR${frNumber}`;
        this._panel.webview.html = this._getHtmlForWebview(frNumber, content);
    }

    private _getHtmlForWebview(frNumber: string, content: FRContent): string {
        const htmlContent = content.html || this._convertToHtml(content.content);
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 20px; }
h1, h2 { color: var(--vscode-textLink-foreground); }
h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
table { border-collapse: collapse; margin: 8px 0; }
td, th { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; }
p { margin: 0.4em 0; }
</style>
</head>
<body>
<h1>FR${frNumber}</h1>
<div>${htmlContent}</div>
</body>
</html>`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    private _convertToHtml(text: string): string {
        return this._escapeHtml(text)
            .replace(/\n\n/g, "</p><p>")
            .replace(/\n/g, "<br>");
    }
}
