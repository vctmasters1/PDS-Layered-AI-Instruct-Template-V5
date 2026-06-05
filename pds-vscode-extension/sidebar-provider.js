const vscode = require('vscode');

/**
 * Tree items for the PDS sidebar.
 */
class PdsTreeItem extends vscode.TreeItem {
    constructor(label, icon, commandId, description) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.description = description || '';
        if (commandId) {
            this.command = {
                command: commandId,
                title: label
            };
        }
    }
}

/**
 * Section header (collapsible group).
 */
class PdsSectionItem extends vscode.TreeItem {
    constructor(label, icon, children) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.children = children;
    }
}

/**
 * TreeDataProvider for the PDS Activity Bar sidebar.
 */
class PdsSidebarProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (!element) {
            // Root level — flat list matching the workflow
            return [
                new PdsTreeItem('Board Editor', 'circuit-board', 'pds.openPinleafForge', 'Pinleaf Forge'),
                new PdsTreeItem('Role', 'symbol-event', 'pds.openRoleEditor', 'Role Editor'),
                new PdsTreeItem('Build', 'package', 'pds.openBuild', 'Core firmware'),
                new PdsTreeItem('Deploy', 'rocket', 'pds.openDeploy', 'Flash & monitor'),
                new PdsTreeItem('Publish', 'cloud-upload', 'pds.publishRole', 'Publish role → WEB-HMI'),
            ];
        }

        // Return children of a section
        if (element.children) {
            return element.children;
        }

        return [];
    }
}

/**
 * Register the sidebar view.
 */
function registerSidebar(context) {
    const provider = new PdsSidebarProvider();

    const treeView = vscode.window.createTreeView('pdsToolbox', {
        treeDataProvider: provider,
        showCollapseAll: false
    });

    // Refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('pds.refreshSidebar', () => provider.refresh())
    );

    context.subscriptions.push(treeView);
    return provider;
}

module.exports = { registerSidebar };
