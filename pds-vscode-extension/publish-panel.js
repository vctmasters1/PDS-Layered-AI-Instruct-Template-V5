/**
 * publish-panel.js
 *
 * Implements the "PDS: Publish Role" command.
 *
 * Publish to WEB-HMI:
 *   Scaffolds WEB-HMI/api/src/devices/<slug>/ from a saved role config,
 *   generating index.ts, config-schema.ts, and firmware-versions.ts,
 *   then registers the handler in devices/index.ts.
 *
 * Publish Firmware (placeholder):
 *   Guidance shown — binary upload to WEB-FwServer to be scripted later.
 */

'use strict';

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');
const { findWorkspaceRoot } = require('./role-fs');

// ──────────────────────────────────────────────────────────────────────────────
// Command registration
// ──────────────────────────────────────────────────────────────────────────────

function registerPublishCommand(context) {
    const cmd = vscode.commands.registerCommand('pds.publishRole', async () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        // Locate WEB-HMI devices directory
        const devicesDir = path.join(workspaceRoot, 'WEB-HMI', 'api', 'src', 'devices');
        if (!fs.existsSync(devicesDir)) {
            vscode.window.showErrorMessage(
                'WEB-HMI/api/src/devices/ not found. Is WEB-HMI open in this workspace?'
            );
            return;
        }

        // List saved roles
        const savedDir = path.join(workspaceRoot, 'PDS-Role', 'saved_roles');
        if (!fs.existsSync(savedDir)) {
            vscode.window.showErrorMessage('No saved roles found in PDS-Role/saved_roles/.');
            return;
        }

        const roleFiles = fs.readdirSync(savedDir).filter(f => f.endsWith('.json'));
        if (roleFiles.length === 0) {
            vscode.window.showErrorMessage('No saved roles found.');
            return;
        }

        // QuickPick — choose role
        const picks = roleFiles.map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(savedDir, f), 'utf-8'));
                return {
                    label:       data.role_id   || f.replace('.json', ''),
                    description: data.display_name || '',
                    detail:      `Target: ${data.target || '—'}   Board: ${data.board || '—'}`,
                    data,
                };
            } catch (_) {
                return null;
            }
        }).filter(Boolean);

        const picked = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select a saved role to publish',
            title:       'PDS: Publish Role',
            matchOnDescription: true,
            matchOnDetail: true,
        });
        if (!picked) return;

        // QuickPick — what to publish
        const action = await vscode.window.showQuickPick(
            [
                {
                    label:       '$(cloud-upload)  Publish to WEB-HMI',
                    description: 'Scaffold device handler in WEB-HMI/api/src/devices/',
                    value:       'hmi',
                },
                {
                    label:       '$(rocket)  Publish Firmware',
                    description: 'Upload firmware binary to WEB-FwServer (coming soon)',
                    value:       'fw',
                },
            ],
            { placeHolder: 'Choose publish target', title: 'PDS: Publish' }
        );
        if (!action) return;

        if (action.value === 'fw') {
            vscode.window.showInformationMessage(
                'Firmware publishing coming soon. ' +
                'Upload binaries via WEB-FwServer/api once the binary is built with PDS-BuildTools.'
            );
            return;
        }

        await publishToWebHmi(picked.data, devicesDir);
    });

    context.subscriptions.push(cmd);
}

// ──────────────────────────────────────────────────────────────────────────────
// WEB-HMI publish logic
// ──────────────────────────────────────────────────────────────────────────────

async function publishToWebHmi(roleConfig, devicesDir) {
    const slug      = toSlug(roleConfig.role_id);
    const varName   = toVarName(slug);
    const displayName = roleConfig.display_name || roleConfig.role_id;
    const deviceDir   = path.join(devicesDir, slug);

    // Confirm overwrite
    if (fs.existsSync(deviceDir)) {
        const choice = await vscode.window.showWarningMessage(
            `Device handler "${slug}" already exists in WEB-HMI. Overwrite?`,
            { modal: true },
            'Overwrite'
        );
        if (choice !== 'Overwrite') return;
    }

    // Collect user-facing variables (skip private _ prefix)
    const params = [];
    if (roleConfig.variables && typeof roleConfig.variables === 'object') {
        for (const vars of Object.values(roleConfig.variables)) {
            if (!Array.isArray(vars)) continue;
            for (const v of vars) {
                if (typeof v.name === 'string' && !v.name.startsWith('_')) {
                    params.push(mapVariable(v));
                }
            }
        }
    }

    // Write files
    fs.mkdirSync(deviceDir, { recursive: true });
    fs.writeFileSync(path.join(deviceDir, 'index.ts'),              genIndexTs(slug, displayName),  'utf-8');
    fs.writeFileSync(path.join(deviceDir, 'config-schema.ts'),      genConfigSchemaTs(params),       'utf-8');
    fs.writeFileSync(path.join(deviceDir, 'firmware-versions.ts'),  genFirmwareVersionsTs(),         'utf-8');

    // Register in devices/index.ts (append if not already present)
    const indexPath = path.join(devicesDir, 'index.ts');
    let indexSrc = fs.readFileSync(indexPath, 'utf-8');
    const importLine   = `import { handler as ${varName} } from "./${slug}/index.js";`;
    const registerLine = `registerDevice(${varName});`;
    if (!indexSrc.includes(importLine)) {
        indexSrc = indexSrc.trimEnd() + '\n' + importLine + '\n' + registerLine + '\n';
        fs.writeFileSync(indexPath, indexSrc, 'utf-8');
    }

    const rel = `WEB-HMI/api/src/devices/${slug}/`;
    const res = await vscode.window.showInformationMessage(
        `Published "${displayName}" → ${rel}. Rebuild the API to activate.`,
        'Open Folder'
    );
    if (res === 'Open Folder') {
        vscode.commands.executeCommand(
            'revealFileInOS',
            vscode.Uri.file(deviceDir)
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Code generators
// ──────────────────────────────────────────────────────────────────────────────

function genIndexTs(slug, displayName) {
    return `import {
  IDeviceHandler,
  IConfigSchema,
  IFirmwareVersion,
  CommProtocol,
} from "../types.js";
import { configSchemas } from "./config-schema.js";
import { firmwareVersions } from "./firmware-versions.js";

export const handler: IDeviceHandler = {
  type: "${slug}",
  displayName: "${displayName}",
  protocols: [CommProtocol.HTTP, CommProtocol.BLUETOOTH],

  getConfigSchema(firmwareVersion: string): IConfigSchema {
    return configSchemas.get(firmwareVersion) ?? configSchemas.values().next().value!;
  },

  validateConfig(
    config: Record<string, unknown>,
    firmwareVersion: string
  ): { valid: boolean; errors?: string[] } {
    const schema = this.getConfigSchema(firmwareVersion);
    const errors: string[] = [];
    for (const param of schema.params) {
      const value = config[param.key];
      if (value === undefined) {
        errors.push(\`Missing required parameter: \${param.key}\`);
        continue;
      }
      if (param.type === "number" || param.type === "range") {
        if (typeof value !== "number") {
          errors.push(\`\${param.key} must be a number\`);
        } else if (param.type === "range" && Array.isArray(param.options)) {
          const [min, max] = param.options as [number, number];
          if (value < min || value > max) {
            errors.push(\`\${param.key} must be between \${min} and \${max}\`);
          }
        }
      } else if (param.type === "boolean") {
        if (typeof value !== "boolean") errors.push(\`\${param.key} must be a boolean\`);
      } else if (param.type === "enum") {
        const opts = param.options as string[] | undefined;
        if (!opts?.includes(value as string)) {
          errors.push(\`\${param.key} must be one of: \${opts?.join(", ")}\`);
        }
      }
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },

  listFirmwareVersions(): IFirmwareVersion[] {
    return firmwareVersions;
  },
};
`;
}

function genConfigSchemaTs(params) {
    const indent = (json) => json.split('\n').map(l => '      ' + l).join('\n');
    return `import { IConfigSchema } from "../types.js";

export const configSchemas = new Map<string, IConfigSchema>([
  [
    "1.0.0",
    {
      version: "1.0.0",
      params: ${indent(JSON.stringify(params, null, 2)).trimStart()},
    },
  ],
]);
`;
}

function genFirmwareVersionsTs() {
    return `import { IFirmwareVersion } from "../types.js";

export const firmwareVersions: IFirmwareVersion[] = [
  {
    version: "1.0.0",
    changelog: "Initial release",
    binarySize: 0,
    sha256: "",
  },
];
`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** "TEST-001" → "test-001", "My Device" → "my-device" */
function toSlug(roleId) {
    return roleId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "test-001" → "test001", "my-device" → "myDevice" (camelCase import var) */
function toVarName(slug) {
    return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
}

/** "wifi_ssid" → "Wifi Ssid" */
function humanLabel(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Map a PDS role variable entry → IConfigParam shape.
 * PDS types: bool, uint8/16/32, int8/16/32, float, string[N], enum:a,b,c
 */
function mapVariable(v) {
    const { name, type, default: def, description, min, max } = v;

    if (type === 'bool') {
        return {
            key: name, label: humanLabel(name), type: 'boolean',
            defaultValue: def === true || def === 'true' || def === 1,
            description,
        };
    }
    if (typeof type === 'string' && type.startsWith('enum:')) {
        const options = type.slice(5).split(',').map(s => s.trim());
        return {
            key: name, label: humanLabel(name), type: 'enum',
            options,
            defaultValue: String(def ?? options[0]),
            description,
        };
    }
    if (typeof type === 'string' && type.startsWith('string')) {
        return {
            key: name, label: humanLabel(name), type: 'string',
            defaultValue: String(def ?? ''),
            description,
        };
    }
    // Numeric — use range when explicit min/max provided
    if (min !== undefined && max !== undefined) {
        return {
            key: name, label: humanLabel(name), type: 'range',
            options: [Number(min), Number(max)],
            defaultValue: Number(def ?? 0),
            description,
        };
    }
    return {
        key: name, label: humanLabel(name), type: 'number',
        defaultValue: Number(def ?? 0),
        description,
    };
}

module.exports = { registerPublishCommand };
