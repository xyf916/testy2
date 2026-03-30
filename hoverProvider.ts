import * as vscode from 'vscode';
import { FRDocumentService } from './frDocumentService';

export class FRHoverProvider implements vscode.HoverProvider {
    private readonly frPattern = /FR(\d+)/gi;

    constructor(private frDocumentService: FRDocumentService) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {
        const range = document.getWordRangeAtPosition(position, this.frPattern);

        if (!range) {
            return null;
        }

        const word = document.getText(range);
        const match = word.match(/FR(\d+)/i);

        if (!match) {
            return null;
        }

        const frNumber = match[1];

        try {
            const preview = await this.frDocumentService.getFRPreview(frNumber);

            if (!preview) {
                return new vscode.Hover(
                    new vscode.MarkdownString(`**FR${frNumber}** - FR not found`)
                );
            }

            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;

            // 200 character preview of content
            const previewText = preview.content.substring(0, 200);
            const truncated = preview.content.length > 200;
            markdown.appendMarkdown(`**FR${frNumber}**\n\n`);
            markdown.appendMarkdown(`${this.escapeMarkdown(previewText)}${truncated ? '...' : ''}\n\n`);

            // Link to open full document in WebView
            const commandUri = vscode.Uri.parse(
                `command:frDetector.openFR?${encodeURIComponent(JSON.stringify(frNumber))}`
            );
            markdown.appendMarkdown(`[Open FR${frNumber}](${commandUri})`);

            return new vscode.Hover(markdown, range);
        } catch (error) {
            console.error(`Error fetching FR${frNumber}:`, error);
            return new vscode.Hover(
                new vscode.MarkdownString(`**FR${frNumber}** - Error: ${error}`)
            );
        }
    }

    private escapeMarkdown(text: string): string {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/\*/g, '\\*')
            .replace(/_/g, '\\_')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
