"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FRHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
class FRHoverProvider {
    constructor(frDocumentService) {
        this.frDocumentService = frDocumentService;
        this.frPattern = /FR(\d+)/gi;
    }
    async provideHover(document, position, token) {
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
                return new vscode.Hover(new vscode.MarkdownString(`**FR${frNumber}** - FR not found`));
            }
            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;
            // 200 character preview of content
            const previewText = preview.content.substring(0, 200);
            const truncated = preview.content.length > 200;
            markdown.appendMarkdown(`**FR${frNumber}**\n\n`);
            markdown.appendMarkdown(`${this.escapeMarkdown(previewText)}${truncated ? '...' : ''}\n\n`);
            // Link to open full document in WebView
            const commandUri = vscode.Uri.parse(`command:frDetector.openFR?${encodeURIComponent(JSON.stringify(frNumber))}`);
            markdown.appendMarkdown(`[Open FR${frNumber}](${commandUri})`);
            return new vscode.Hover(markdown, range);
        }
        catch (error) {
            console.error(`Error fetching FR${frNumber}:`, error);
            return new vscode.Hover(new vscode.MarkdownString(`**FR${frNumber}** - Error: ${error}`));
        }
    }
    escapeMarkdown(text) {
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
exports.FRHoverProvider = FRHoverProvider;
//# sourceMappingURL=hoverProvider.js.map