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
exports.FRDocumentService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class FRDocumentService {
    constructor(context) {
        this.context = context;
        this.cache = new Map();
        this.fullCache = new Map();
        this.pythonScriptPath = path.join(context.extensionPath, 'python', 'fr_processor.py');
        this.ingestScriptPath = path.join(context.extensionPath, 'python', 'ingest_fr.py');
        const storageDir = context.globalStorageUri.fsPath;
        fs.mkdirSync(storageDir, { recursive: true });
        this.dbPath = path.join(storageDir, 'fr_cache.db');
    }
    // -------------------------------------------------------------------------
    // Folder resolution
    // -------------------------------------------------------------------------
    getFRFolderPath() {
        const config = vscode.workspace.getConfiguration('frDetector');
        const configuredPath = config.get('frFolderPath', '');
        if (configuredPath && this.isFRFolder(configuredPath)) {
            return configuredPath;
        }
        const candidates = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const wsRoot = workspaceFolders[0].uri.fsPath;
            candidates.push(path.join(wsRoot, 'FR'));
            let dir = wsRoot;
            for (let i = 0; i < 5; i++) {
                const parent = path.dirname(dir);
                if (parent === dir) {
                    break;
                }
                candidates.push(path.join(parent, 'FR'));
                dir = parent;
            }
        }
        const home = os.homedir();
        candidates.push(path.join(home, 'FR'), path.join(home, 'Documents', 'FR'), path.join(home, 'OneDrive', 'FR'), path.join(home, 'Desktop', 'FR'));
        for (const candidate of candidates) {
            if (this.isFRFolder(candidate)) {
                return candidate;
            }
        }
        return '';
    }
    /** Returns all configured root folders for ingestion / search. */
    getFRFolderPaths() {
        const config = vscode.workspace.getConfiguration('frDetector');
        const paths = config.get('frFolderPaths', []);
        const valid = paths.filter(p => p && fs.existsSync(p));
        if (valid.length > 0) {
            return valid;
        }
        // Fall back to single-path setting / auto-detection
        const single = this.getFRFolderPath();
        return single ? [single] : [];
    }
    isFRFolder(folderPath) {
        try {
            if (!fs.existsSync(folderPath)) {
                return false;
            }
            const entries = fs.readdirSync(folderPath);
            return entries.some(e => /^FR\d+s$/i.test(e));
        }
        catch {
            return false;
        }
    }
    getPythonPath() {
        const config = vscode.workspace.getConfiguration('frDetector');
        return config.get('pythonPath', 'python');
    }
    // -------------------------------------------------------------------------
    // Python subprocess helpers
    // -------------------------------------------------------------------------
    async executePythonScript(args) {
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
                }
                else {
                    reject(new Error(stderr || `Python script exited with code ${code}`));
                }
            });
            proc.on('error', (err) => { reject(err); });
        });
    }
    // -------------------------------------------------------------------------
    // Preview / full content (hover + document viewer)
    // -------------------------------------------------------------------------
    async getFRPreview(frNumber) {
        if (this.cache.has(frNumber)) {
            return this.cache.get(frNumber);
        }
        const frFolderPath = this.getFRFolderPath();
        if (!frFolderPath) {
            throw new Error('FR folder path not configured');
        }
        try {
            const result = await this.executePythonScript([
                'preview', frNumber, frFolderPath, this.dbPath
            ]);
            const preview = JSON.parse(result);
            if (preview && preview.content) {
                this.cache.set(frNumber, preview);
                return preview;
            }
            return null;
        }
        catch (error) {
            console.error(`Error getting FR preview: ${error}`);
            throw error;
        }
    }
    async getFRContent(frNumber) {
        if (this.fullCache.has(frNumber)) {
            return this.fullCache.get(frNumber);
        }
        const frFolderPath = this.getFRFolderPath();
        if (!frFolderPath) {
            throw new Error('FR folder path not configured');
        }
        try {
            const result = await this.executePythonScript([
                'full', frNumber, frFolderPath
            ]);
            const content = JSON.parse(result);
            if (content && content.content) {
                this.fullCache.set(frNumber, content);
                return content;
            }
            return null;
        }
        catch (error) {
            console.error(`Error getting FR content: ${error}`);
            throw error;
        }
    }
    async getFRContentByPath(frNumber, filePath) {
        if (this.fullCache.has(frNumber)) {
            return this.fullCache.get(frNumber);
        }
        try {
            const result = await this.executePythonScript(['full_by_path', frNumber, filePath]);
            const content = JSON.parse(result);
            if (content && content.content) {
                this.fullCache.set(frNumber, content);
                return content;
            }
            return null;
        }
        catch (error) {
            console.error(`Error getting FR content by path: ${error}`);
            throw error;
        }
    }
    async clearCache() {
        this.cache.clear();
        this.fullCache.clear();
        try {
            await this.executePythonScript(['clear_cache', this.dbPath]);
        }
        catch {
            // DB clear failure is non-fatal
        }
    }
    // -------------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------------
    async searchFR(query, filters) {
        const result = await this.executePythonScript([
            'search',
            this.dbPath,
            query,
            filters.status || '',
            filters.severity || '',
            filters.subsystem || '',
        ]);
        const parsed = JSON.parse(result);
        if (parsed.error) {
            throw new Error(parsed.error);
        }
        return parsed.results || [];
    }
    async getFilterOptions() {
        try {
            const result = await this.executePythonScript(['filter_options', this.dbPath]);
            return JSON.parse(result);
        }
        catch {
            return { statuses: [], severities: [], subsystems: [] };
        }
    }
    // -------------------------------------------------------------------------
    // Ingestion
    // -------------------------------------------------------------------------
    async executeIngest(onProgress) {
        const folders = this.getFRFolderPaths();
        if (folders.length === 0) {
            throw new Error('No FR folder paths found. Configure frDetector.frFolderPaths in Settings.');
        }
        const config = vscode.workspace.getConfiguration('frDetector');
        const includePatterns = config.get('includePatterns', []);
        const excludePatterns = config.get('excludePatterns', []);
        return new Promise((resolve, reject) => {
            const pythonPath = this.getPythonPath();
            const args = [this.ingestScriptPath, this.dbPath, ...folders];
            for (const pat of includePatterns) {
                args.push('--include', pat);
            }
            for (const pat of excludePatterns) {
                args.push('--exclude', pat);
            }
            const proc = cp.spawn(pythonPath, args, {
                cwd: this.context.extensionPath
            });
            let buffer = '';
            let finalResult = { count: 0, errors: 0 };
            proc.stdout.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }
                    try {
                        const msg = JSON.parse(line);
                        if (msg.stage === 'progress') {
                            onProgress(msg.current, msg.total, msg.file);
                        }
                        else if (msg.stage === 'done') {
                            finalResult = { count: msg.count, errors: msg.errors };
                        }
                    }
                    catch { /* ignore malformed lines */ }
                }
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(finalResult);
                }
                else {
                    reject(new Error('Ingestion process exited with an error'));
                }
            });
            proc.on('error', (err) => { reject(err); });
        });
    }
    // -------------------------------------------------------------------------
    dispose() {
        this.clearCache();
    }
}
exports.FRDocumentService = FRDocumentService;
//# sourceMappingURL=frDocumentService.js.map