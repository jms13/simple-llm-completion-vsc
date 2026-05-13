import OpenAI from "openai";
import * as vscode from "vscode";
import { readEnv } from "./utils";

const STATUS_BAR_NAME = "Simple LLM Completion";

enum AddContextFromOpenFiles {
    None = "none",
    Workspace = "workspace",
    All = "all",
}

export class State {
    // Singleton
    private static instance: State;

    private context: vscode.ExtensionContext;
    private _completion: Completion;
    private _statusBar: vscode.StatusBarItem;

    public static getInstance(context: vscode.ExtensionContext): State {
        if (!State.instance) {
            State.instance = new State(context);
        }
        return State.instance;
    }

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._statusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right
        );
        this._statusBar.name = "Simple LLM Completion";
        this._statusBar.text = "$(check) " + STATUS_BAR_NAME;
        this._statusBar.tooltip = "Click to open settings";
        this._statusBar.command = {
            title: 'Open Settings',
            command: 'workbench.action.openSettings',
            arguments: ['@ext:jms13.simple-llm-completion']
        };
        this._statusBar.show();
        this._completion = new Completion((text: string) => this.udateStatusBar(text));

    }

    public get completion(): Completion {
        return this._completion;
    }

    public get statusBar(): vscode.StatusBarItem {
        return this._statusBar;
    }

    public onConfigurationChange(): void {
        this._completion.onConfigurationChange();
        this.udateStatusBar("$(check)");
    }

    udateStatusBar(text: string) {
        this._statusBar.text = text + " " + STATUS_BAR_NAME;
    }

}

export class Completion implements vscode.InlineCompletionItemProvider {
    private openAiClient: OpenAI | null = null;
    private callQueue: LastOnlyQueue = new LastOnlyQueue();
    private updateStatusBar: (text: string) => void;
    private config: vscode.WorkspaceConfiguration;

    constructor(updateStatusBar: (text: string) => void) {
        this.updateStatusBar = updateStatusBar;
        this.config = vscode.workspace.getConfiguration("simpleLlmCompletion");
    }

    async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        const useAutomaticCompletion = this.config.get<boolean>("useAutomaticCompletion") ?? false;
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && !useAutomaticCompletion) {
            return [];
        }
        try {
            return await this.callQueue.enqueue(async () =>
                this.doCompletion(document, position, context, token)
            );
        } catch (error) {
            if (error instanceof SkippedTaskError) {
                return [];
            }
            console.error("Failed to schedule a call to OpenAI client", error);
            return [];
        }
    }

    onConfigurationChange() {
        this.config = vscode.workspace.getConfiguration("simpleLlmCompletion");
        this.openAiClient = null;
    }


    private async doCompletion(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        this.updateStatusBar("$(loading)");
        const { curentFilePrompt } = this.getCurrentFilePrompt(document, position);
        // Collect context and current file.
        const addContextFromOpenFiles = this.config.get<AddContextFromOpenFiles>("addContextFromOpenFiles") ?? AddContextFromOpenFiles.None;
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const workspaceHeader = workspacePath ? "<|repo_name|>" + workspacePath + "\n" : "";
        const otherFilesPrompt: string = await this.getOtherFilesPrompt(document, addContextFromOpenFiles, workspacePath ?? "unknown-workspace");
        const finalPrompt = workspaceHeader + otherFilesPrompt + curentFilePrompt;
        // Prepare client
        let openAiClient = this.getOpenAiClient();
        if (openAiClient === null) {
            this.updateStatusBar("$(error)");
            return [];
        }
        try {
            console.debug("Sending prompt:", finalPrompt);
            const maxCompletionTokens = this.config.get<number>("maxCompletionTokens");
            const apiModel = this.config.get<string>("model");
            const temperature = this.config.get<number>("temperature");
            this.updateStatusBar("$(loading)");
            const response = await openAiClient.completions.create({
                model: apiModel ?? "any-model",
                prompt: finalPrompt,
                max_tokens: maxCompletionTokens,
                temperature: temperature ?? 0.1,
            });
            this.updateStatusBar("$(check)");
            if (response.choices.length < 1) {
                return [];
            }
            let completion = response.choices[0].text;
            console.debug("Got completion:", completion);
            if (completion.trim().length > 0) {
                this.updateStatusBar("$(check-all)");
            } else {
                completion = completion.trim();
                this.updateStatusBar("$(check)");
            }
            return [
                new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))
            ];
        } catch (error) {
            vscode.window.showErrorMessage("Failed to call OpenAI client: " + error);
            this.updateStatusBar("$(error)");
            this.openAiClient = null;
            return [];
        }
    }

    private async getOtherFilesPrompt(document: vscode.TextDocument, addContextFromOpenFiles: AddContextFromOpenFiles, workspacePath: string): Promise<string> {
        if (addContextFromOpenFiles === AddContextFromOpenFiles.None) {
            return "";
        }
        let cleanDocumentUris: vscode.Uri[] = [];
        let dirtyDocumentUris: vscode.Uri[] = [];
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    switch (addContextFromOpenFiles) {
                        case AddContextFromOpenFiles.Workspace:
                            if (!uri.fsPath.startsWith(workspacePath)) {
                                continue;
                            }
                            break;
                        case AddContextFromOpenFiles.All:
                            break;
                    }
                    if (uri.toString() === document.uri.toString()) {
                        continue;
                    }
                    if (!tab.isDirty) {
                        cleanDocumentUris.push(uri);
                    } else {
                        dirtyDocumentUris.push(uri);
                    }
                }
            }
        }
        cleanDocumentUris = sortedUniqeUris(cleanDocumentUris);
        dirtyDocumentUris = sortedUniqeUris(dirtyDocumentUris);
        const otherContent: string[] = [];
        for (const uri of cleanDocumentUris) {
            let document = await getDocument(uri);
            if (document !== null) {
                otherContent.push("<|file_sep|>" + document.fileName);
                otherContent.push(document.getText());
            }
        }
        return otherContent.join("\n") + "\n";
    }

    private getCurrentFilePrompt(document: vscode.TextDocument, position: vscode.Position): CurrentFileInput {
        const linesBefore: string[] = [];
        for (let i = 0; i < position.line; i++) {
            linesBefore.push(document.lineAt(i).text);
        }
        const linesAfter: string[] = [];
        for (let i = position.line + 1; i < document.lineCount; i++) {
            linesAfter.push(document.lineAt(i).text);
        }
        const currentLine = document.lineAt(position.line).text;
        const currentLinePrefix = currentLine.slice(0, position.character);
        const currentLineSuffix = currentLine.slice(position.character);
        const inputPrefix = linesBefore.join("\n") + "\n" + currentLinePrefix;
        const inputSuffix = currentLineSuffix + "\n" + linesAfter.join("\n") + "\n";
        const curentFilePrompt = "<|file_sep|>" + document.fileName + "\n" + "<|fim_prefix|>" + inputPrefix + "<|fim_suffix|>" + inputSuffix + "<|fim_middle|>";
        return {
            curentFilePrompt
        };
    }

    private getOpenAiClient(): OpenAI | null {
        if (this.openAiClient) {
            return this.openAiClient;
        }
        const baseURL = this.config.get<string>("apiEndpoint");
        const apiKey = readEnv('OPENAI_API_KEY') ?? "fake";
        try {
            this.openAiClient = new OpenAI({
                baseURL,
                apiKey,
            });
            return this.openAiClient;

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create OpenAI client @ ${baseURL}: ` + error);
            return null;
        }
    }
}

interface CurrentFileInput {
    curentFilePrompt: string;
};

class LastOnlyQueue {
    private currentPromise: Promise<unknown> = Promise.resolve();
    private lastEnqueued: (() => Promise<unknown>) | null = null;

    enqueue<T>(task: () => Promise<T>): Promise<T> {
        this.lastEnqueued = task;
        const thisPromise = this.currentPromise.then(() => {
            if (this.lastEnqueued === task) {
                this.lastEnqueued = null;
                return task();
            } else {
                return Promise.reject(new SkippedTaskError());
            }
        });
        this.currentPromise = thisPromise.catch(() => { });
        return thisPromise as Promise<T>;
    }
}

class SkippedTaskError extends Error {
    constructor() {
        super('Task was skipped because a newer one was enqueued');
        this.name = 'SkippedTaskError';
    }
}

async function getDocument(uri: vscode.Uri): Promise<vscode.TextDocument | null> {
    for (const document of vscode.workspace.textDocuments) {
        if (document.uri === uri) {
            return document;
        }
    }
    try {
        return await vscode.workspace.openTextDocument(uri);
    } catch (error) {
        console.warn(`Failed to open document: ${uri.toString()}`, error);
        return null;
    }
}


function sortedUniqeUris(arr: vscode.Uri[]): vscode.Uri[] {
    const uniqueMap = new Map<string, vscode.Uri>();
    for (const item of arr) {
        const key = item.toString();
        if (!uniqueMap.has(key)) { uniqueMap.set(key, item); }
    }
    return Array.from(uniqueMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, item]) => item);
}
