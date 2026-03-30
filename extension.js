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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const hoverProvider_1 = require("./hoverProvider");
const frDocumentService_1 = require("./frDocumentService");
const webviewPanel_1 = require("./webviewPanel");
const frSearchPanel_1 = require("./frSearchPanel");
let frDocumentService;
let statusBarItem;
let searchPanel;
function activate(context) {
    // Initialize the document service
    frDocumentService = new frDocumentService_1.FRDocumentService(context);
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(file-text) FR Detector";
    statusBarItem.tooltip = "FR Reference Detector Active";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Register hover provider for C++ and Ada files
    const cppSelector = [
        { language: 'cpp', scheme: 'file' },
        { language: 'c', scheme: 'file' }
    ];
    const adaSelector = [
        { language: 'ada', scheme: 'file' }
    ];
    const hoverProvider = new hoverProvider_1.FRHoverProvider(frDocumentService);
    context.subscriptions.push(vscode.languages.registerHoverProvider(cppSelector, hoverProvider), vscode.languages.registerHoverProvider(adaSelector, hoverProvider));
    // Register sidebar search panel
    searchPanel = new frSearchPanel_1.FRSearchPanel(context.extensionUri, frDocumentService);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(frSearchPanel_1.FRSearchPanel.viewType, searchPanel, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // Command: open FR document (hover link + manual entry + search panel click)
    const openFRCommand = vscode.commands.registerCommand('frDetector.openFR', async (frNumber, filePath) => {
        if (!frNumber) {
            frNumber = await vscode.window.showInputBox({
                prompt: 'Enter FR number (e.g., FR222)',
                placeHolder: 'FR222'
            }) || '';
        }
        if (frNumber) {
            const match = frNumber.match(/FR(\d+)/i);
            if (match) {
                frNumber = match[1];
            }
            try {
                statusBarItem.text = "$(sync~spin) Loading FR...";
                const content = filePath
                    ? await frDocumentService.getFRContentByPath(frNumber, filePath)
                    : await frDocumentService.getFRContent(frNumber);
                if (content) {
                    webviewPanel_1.FRWebViewPanel.createOrShow(context.extensionUri, frNumber, content);
                    statusBarItem.text = "$(file-text) FR Detector";
                }
                else {
                    vscode.window.showErrorMessage(`FR${frNumber} document not found`);
                    statusBarItem.text = "$(file-text) FR Detector";
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Error loading FR${frNumber}: ${error}`);
                statusBarItem.text = "$(file-text) FR Detector";
            }
        }
    });
    // Command: refresh hover cache
    const refreshCacheCommand = vscode.commands.registerCommand('frDetector.refreshCache', async () => {
        await frDocumentService.clearCache();
        vscode.window.showInformationMessage('FR Document cache cleared');
    });
    // Command: ingest documents (with streaming progress)
    const ingestCommand = vscode.commands.registerCommand('frDetector.ingestDocuments', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'FR Detector: Ingesting documents',
            cancellable: false,
        }, async (progress) => {
            progress.report({ message: 'Scanning folders...' });
            let lastPct = 0;
            try {
                const result = await frDocumentService.executeIngest((current, total, file) => {
                    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                    progress.report({
                        increment: pct - lastPct,
                        message: `${current} / ${total}  —  ${file}`,
                    });
                    lastPct = pct;
                });
                const errNote = result.errors > 0 ? `  (${result.errors} file${result.errors !== 1 ? 's' : ''} skipped)` : '';
                vscode.window.showInformationMessage(`FR Detector: Indexed ${result.count} document${result.count !== 1 ? 's' : ''}${errNote}`);
                // Refresh filter dropdowns in the search panel
                searchPanel.refresh();
            }
            catch (error) {
                vscode.window.showErrorMessage(`FR Detector ingestion failed: ${error}`);
            }
        });
    });
    // Command: Quick Pick keyword search
    const searchCommand = vscode.commands.registerCommand('frDetector.searchFR', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Type to search FR documents...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        let searchTimer;
        quickPick.onDidChangeValue((value) => {
            clearTimeout(searchTimer);
            if (value.trim().length < 2) {
                quickPick.items = [];
                return;
            }
            quickPick.busy = true;
            searchTimer = setTimeout(async () => {
                try {
                    const results = await frDocumentService.searchFR(value.trim(), {});
                    quickPick.items = results.map((r) => ({
                        label: `FR${r.frNumber}`,
                        description: r.title || '',
                        detail: [r.status, r.severity, r.subsystem].filter(Boolean).join('  ·  ') || r.snippet || '',
                    }));
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg === 'not_indexed') {
                        quickPick.items = [{
                                label: '$(warning) Not indexed',
                                description: 'Run "FR: Ingest Documents" first',
                            }];
                    }
                }
                finally {
                    quickPick.busy = false;
                }
            }, 300);
        });
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected && selected.label.startsWith('FR')) {
                const frNumber = selected.label.replace(/^FR/, '');
                vscode.commands.executeCommand('frDetector.openFR', frNumber);
            }
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            clearTimeout(searchTimer);
            quickPick.dispose();
        });
        quickPick.show();
    });
    context.subscriptions.push(openFRCommand, refreshCacheCommand, ingestCommand, searchCommand);
    // Update status bar on active editor change
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateStatusBar(editor);
    }));
    updateStatusBar(vscode.window.activeTextEditor);
}
function updateStatusBar(editor) {
    if (editor) {
        const langId = editor.document.languageId;
        if (langId === 'cpp' || langId === 'c' || langId === 'ada') {
            statusBarItem.show();
        }
        else {
            statusBarItem.hide();
        }
    }
    else {
        statusBarItem.hide();
    }
}
function deactivate() {
    if (frDocumentService) {
        frDocumentService.dispose();
    }
}
//# sourceMappingURL=extension.js.map