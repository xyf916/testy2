import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

export interface FRPreview {
    title: string;
    status: string;
    content: string;
    filePath: string;
}

export interface FRContent {
    title: string;
    status: string;
    content: string;
    headings: string[];
    filePath: string;
    html: string;
}

export interface FRSearchResult {
    frNumber: string;
    title: string;
    snippet: string;
    filePath: string;
    originator: string;
}

export class FRDocumentService {
    private cache: Map<string, FRPreview> = new Map();
    private fullCache: Map<string, FRContent> = new Map();
    private pythonScriptPath: string;
    private ingestScriptPath: string;
    readonly dbPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.pythonScriptPath = path.join(context.extensionPath, 'python', 'fr_processor.py');
        this.ingestScriptPath = path.join(context.extensionPath, 'python', 'ingest_fr.py');
        const storageDir = context.globalStorageUri.fsPath;
        fs.mkdirSync(storageDir, { recursive: true });
        this.dbPath = path.join(storageDir, 'fr_cache.db');
    }

    // -------------------------------------------------------------------------
    // Folder resolution
    // -------------------------------------------------------------------------

    private getFRFolderPath(): string {
        const config = vscode.workspace.getConfiguration('frDetector');
        const configuredPath = config.get<string>('frFolderPath', '');

        if (configuredPath && this.isFRFolder(configuredPath)) {
            return configuredPath;
        }

        const candidates: string[] = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const wsRoot = workspaceFolders[0].uri.fsPath;
            candidates.push(path.join(wsRoot, 'FR'));

            let dir = wsRoot;
            for (let i = 0; i < 5; i++) {
                const parent = path.dirname(dir);
                if (parent === dir) { break; }
                candidates.push(path.join(parent, 'FR'));
                dir = parent;
            }
        }

        const home = os.homedir();
        candidates.push(
            path.join(home, 'FR'),
            path.join(home, 'Documents', 'FR'),
            path.join(home, 'OneDrive', 'FR'),
            path.join(home, 'Desktop', 'FR'),
        );

        for (const candidate of candidates) {
            if (this.isFRFolder(candidate)) {
                return candidate;
            }
        }

        return '';
    }

    /** Returns all configured root folders for ingestion / search. */
    public getFRFolderPaths(): string[] {
        const config = vscode.workspace.getConfiguration('frDetector');
        const paths = config.get<string[]>('frFolderPaths', []);
        const valid = paths.filter(p => p && fs.existsSync(p));
        if (valid.length > 0) {
            return valid;
        }
        // Fall back to single-path setting / auto-detection
        const single = this.getFRFolderPath();
        return single ? [single] : [];
    }

    private isFRFolder(folderPath: string): boolean {
        try {
            if (!fs.existsSync(folderPath)) { return false; }
            const entries = fs.readdirSync(folderPath);
            return entries.some(e => /^fr\d+$/i.test(e));
        } catch {
            return false;
        }
    }

    private getPythonPath(): string {
        const config = vscode.workspace.getConfiguration('frDetector');
        return config.get<string>('pythonPath', 'python');
    }

    // -------------------------------------------------------------------------
    // Python subprocess helpers
    // -------------------------------------------------------------------------

    private async executePythonScript(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const pythonPath = this.getPythonPath();
            const proc = cp.spawn(pythonPath, [this.pythonScriptPath, ...args], {
                cwd: this.context.extensionPath
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || `Python script exited with code ${code}`));
                }
            });

            proc.on('error', (err) => { reject(err); });
        });
    }

    // -------------------------------------------------------------------------
    // Preview / full content (hover + document viewer)
    // -------------------------------------------------------------------------

    async getFRPreview(frNumber: string): Promise<FRPreview | null> {
        if (this.cache.has(frNumber)) {
            return this.cache.get(frNumber)!;
        }

        const frFolderPath = this.getFRFolderPath();
        if (!frFolderPath) {
            throw new Error('FR folder path not configured');
        }

        try {
            const result = await this.executePythonScript([
                'preview', frNumber, frFolderPath, this.dbPath
            ]);

            const preview = JSON.parse(result) as FRPreview;
            if (preview && preview.content) {
                this.cache.set(frNumber, preview);
                return preview;
            }
            return null;
        } catch (error) {
            // console.error(`Error getting FR preview: ${error}`);
            throw error;
        }
    }

    async getFRContent(frNumber: string): Promise<FRContent | null> {
        if (this.fullCache.has(frNumber)) {
            return this.fullCache.get(frNumber)!;
        }

        const frFolderPath = this.getFRFolderPath();
        if (!frFolderPath) {
            throw new Error('FR folder path not configured');
        }

        try {
            const result = await this.executePythonScript([
                'full', frNumber, frFolderPath
            ]);

            const content = JSON.parse(result) as FRContent;
            if (content && content.content) {
                this.fullCache.set(frNumber, content);
                return content;
            }
            return null;
        } catch (error) {
            // console.error(`Error getting FR content: ${error}`);
            throw error;
        }
    }

    async getFRContentByPath(frNumber: string, filePath: string): Promise<FRContent | null> {
        if (this.fullCache.has(frNumber)) {
            return this.fullCache.get(frNumber)!;
        }
        try {
            const result = await this.executePythonScript(['full_by_path', frNumber, filePath]);
            const content = JSON.parse(result) as FRContent;
            if (content && content.content) {
                this.fullCache.set(frNumber, content);
                return content;
            }
            return null;
        } catch (error) {
            // console.error(`Error getting FR content by path: ${error}`);
            throw error;
        }
    }

    async clearCache(): Promise<void> {
        this.cache.clear();
        this.fullCache.clear();
        try {
            await this.executePythonScript(['clear_cache', this.dbPath]);
        } catch {
            // DB clear failure is non-fatal
        }
    }

    // -------------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------------

    async searchFR(
        query: string,
        filters: { originator?: string; frNumber?: string }
    ): Promise<FRSearchResult[]> {
        const result = await this.executePythonScript([
            'search',
            this.dbPath,
            query,
            filters.originator || '',
            filters.frNumber   || '',
        ]);

        const parsed = JSON.parse(result) as { results: FRSearchResult[]; error?: string };
        if (parsed.error) {
            throw new Error(parsed.error);
        }
        return parsed.results || [];
    }

    // -------------------------------------------------------------------------
    // Ingestion
    // -------------------------------------------------------------------------

    async executeIngest(
        onProgress: (current: number, total: number, file: string) => void
    ): Promise<{ count: number; errors: number }> {
        const folders = this.getFRFolderPaths();
        if (folders.length === 0) {
            throw new Error(
                'No FR folder paths found. Configure frDetector.frFolderPaths in Settings.'
            );
        }

        const config = vscode.workspace.getConfiguration('frDetector');
        const includePatterns = config.get<string[]>('includePatterns', []);
        const excludePatterns = config.get<string[]>('excludePatterns', []);

        return new Promise((resolve, reject) => {
            const pythonPath = this.getPythonPath();
            const args = [this.ingestScriptPath, this.dbPath, ...folders];
            for (const pat of includePatterns) { args.push('--include', pat); }
            for (const pat of excludePatterns) { args.push('--exclude', pat); }

            const proc = cp.spawn(pythonPath, args, {
                cwd: this.context.extensionPath
            });

            let buffer = '';
            let finalResult = { count: 0, errors: 0 };

            proc.stdout.on('data', (data: Buffer) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) { continue; }
                    try {
                        const msg = JSON.parse(line);
                        if (msg.stage === 'progress') {
                            onProgress(msg.current, msg.total, msg.file);
                        } else if (msg.stage === 'done') {
                            finalResult = { count: msg.count, errors: msg.errors };
                        }
                    } catch { /* ignore malformed lines */ }
                }
            });

            proc.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve(finalResult);
                } else {
                    reject(new Error('Ingestion process exited with an error'));
                }
            });

            proc.on('error', (err: Error) => { reject(err); });
        });
    }

    // -------------------------------------------------------------------------

    dispose(): void {
        this.clearCache();
    }
}
