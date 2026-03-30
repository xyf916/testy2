import * as vscode from 'vscode';
import { FRHoverProvider } from './hoverProvider';
import { FRDocumentService } from './frDocumentService';
import { FRWebViewPanel } from './webviewPanel';
import { FRSearchPanel } from './frSearchPanel';

let frDocumentService: FRDocumentService;
let statusBarItem: vscode.StatusBarItem;
let searchPanel: FRSearchPanel;

export function activate(context: vscode.ExtensionContext) {

    // Initialize the document service
    frDocumentService = new FRDocumentService(context);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(file-text) FR Detector";
    statusBarItem.tooltip = "FR Reference Detector Active";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register hover provider for C++ and Ada files
    const cppSelector: vscode.DocumentSelector = [
        { language: 'cpp', scheme: 'file' },
        { language: 'c', scheme: 'file' }
    ];
    const adaSelector: vscode.DocumentSelector = [
        { language: 'ada', scheme: 'file' }
    ];

    const hoverProvider = new FRHoverProvider(frDocumentService);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(cppSelector, hoverProvider),
        vscode.languages.registerHoverProvider(adaSelector, hoverProvider)
    );

    // Register sidebar search panel
    searchPanel = new FRSearchPanel(context.extensionUri, frDocumentService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(FRSearchPanel.viewType, searchPanel, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Command: open FR document (hover link + manual entry + search panel click)
    const openFRCommand = vscode.commands.registerCommand('frDetector.openFR', async (frNumber: string, filePath?: string) => {
        if (!frNumber) {
            frNumber = await vscode.window.showInputBox({
                prompt: 'Enter FR number (e.g., FR222)',
                placeHolder: 'FR222'
            }) || '';
        }

        if (frNumber) {
            const match = frNumber.match(/FR(\d+)/i);
            if (match) { frNumber = match[1]; }

            try {
                statusBarItem.text = "$(sync~spin) Loading FR...";
                const content = filePath
                    ? await frDocumentService.getFRContentByPath(frNumber, filePath)
                    : await frDocumentService.getFRContent(frNumber);
                if (content) {
                    FRWebViewPanel.createOrShow(context.extensionUri, frNumber, content);
                    statusBarItem.text = "$(file-text) FR Detector";
                } else {
                    vscode.window.showErrorMessage(`FR${frNumber} document not found`);
                    statusBarItem.text = "$(file-text) FR Detector";
                }
            } catch (error) {
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
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'FR Detector: Ingesting documents',
                cancellable: false,
            },
            async (progress) => {
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
                    vscode.window.showInformationMessage(
                        `FR Detector: Indexed ${result.count} document${result.count !== 1 ? 's' : ''}${errNote}`
                    );

                    // Refresh filter dropdowns in the search panel
                    searchPanel.refresh();

                } catch (error) {
                    vscode.window.showErrorMessage(`FR Detector ingestion failed: ${error}`);
                }
            }
        );
    });

    // Command: Quick Pick keyword search
    const searchCommand = vscode.commands.registerCommand('frDetector.searchFR', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Type to search FR documents...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        let searchTimer: ReturnType<typeof setTimeout> | undefined;

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
                        label:       `FR${r.frNumber}`,
                        description: r.title || '',
                        detail:      [r.status, r.severity, r.subsystem].filter(Boolean).join('  ·  ') || r.snippet || '',
                    }));
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg === 'not_indexed') {
                        quickPick.items = [{
                            label: '$(warning) Not indexed',
                            description: 'Run "FR: Ingest Documents" first',
                        }];
                    }
                } finally {
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
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateStatusBar(editor);
        })
    );

    updateStatusBar(vscode.window.activeTextEditor);
}

function updateStatusBar(editor: vscode.TextEditor | undefined) {
    if (editor) {
        const langId = editor.document.languageId;
        if (langId === 'cpp' || langId === 'c' || langId === 'ada') {
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    } else {
        statusBarItem.hide();
    }
}

export function deactivate() {
    if (frDocumentService) {
        frDocumentService.dispose();
    }
}
