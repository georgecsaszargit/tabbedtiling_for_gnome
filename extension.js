// extension.js

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main    from 'resource:///org/gnome/shell/ui/main.js';
import Meta         from 'gi://Meta';
import Shell        from 'gi://Shell';

import { SettingsManager }  from './modules/SettingsManager.js';
import { HighlightManager } from './modules/HighlightManager.js';
import { WindowManager }    from './modules/WindowManager.js';
import { Indicator }        from './modules/Indicator.js';

const ENABLE_ZONING_KEY     = 'enable-auto-zoning';
const CYCLE_ACCELERATOR_KEY = 'cycle-zone-windows-accelerator';
const log = msg => console.log(`[AutoZoner.Main] ${msg}`);

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager     = null;
        this._highlightManager    = null;
        this._windowManager       = null;
        this._indicator           = null;
        this._monitorsChangedId   = 0;
        this._zoningChangedId     = 0;
        this._cycleAccelChangedId = 0;
    }

    enable() {
        log('Enabling…');

        // 1) Initialize
        this._settingsManager  = new SettingsManager(this.getSettings(), this.path);
        this._highlightManager = new HighlightManager(this._settingsManager);
        this._windowManager    = new WindowManager(this._settingsManager, this._highlightManager);
        this._indicator        = new Indicator(this.uuid, this._settingsManager, this);

        // 2) Tile/untile signals
        this._windowManager.connectSignals();
        this._zoningChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${ENABLE_ZONING_KEY}`,
            () => {
                this._windowManager.connectSignals();
                this._indicator.updateToggleState();
            }
        );

        // 3) Reinit highlighters on monitor change
        if (Main.layoutManager) {
            this._monitorsChangedId = Main.layoutManager.connect(
                'monitors-changed',
                () => this._highlightManager.reinitHighlighters()
            );
        }

        // 4) Install and watch the cycle-windows keybinding
        this._addCycleKeybinding();
        this._cycleAccelChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${CYCLE_ACCELERATOR_KEY}`,
            () => {
                log('Cycle accelerator changed; rebinding…');
                Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY);
                this._addCycleKeybinding();
            }
        );

        log('Enabled.');
    }

    disable() {
        log('Disabling…');

        if (this._monitorsChangedId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._zoningChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._zoningChangedId);
            this._zoningChangedId = 0;
        }
        if (this._cycleAccelChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._cycleAccelChangedId);
            this._cycleAccelChangedId = 0;
        }

        Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY);

        this._windowManager.cleanupWindowProperties();
        this._windowManager.destroy();
        this._highlightManager.destroy();
        this._indicator.destroy();
        this._settingsManager.destroy();

        log('Disabled.');
    }

    _addCycleKeybinding() {
        // Grab the primary accelerator from GSettings
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_ACCELERATOR_KEY)[0];
        log(`Binding cycle shortcut: ${accel}`);

        Main.wm.addKeybinding(
            CYCLE_ACCELERATOR_KEY,
            this._settingsManager.getGSettingObject(),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => {
                log('🏷️ Cycle shortcut pressed!');
                this._windowManager.cycleWindowsInCurrentZone();
            }
        );
    }
}

