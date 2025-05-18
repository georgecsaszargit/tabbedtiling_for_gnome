import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { SettingsManager }   from './modules/SettingsManager.js';
import { HighlightManager }  from './modules/HighlightManager.js';
import { WindowManager }     from './modules/WindowManager.js';
import { Indicator }         from './modules/Indicator.js';

const log = (msg) => console.log(`[AutoZoner.Main] ${msg}`);
const ENABLE_ZONING_KEY = 'enable-auto-zoning';

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager = null;
        this._highlightManager = null;
        this._windowManager   = null;
        this._indicator       = null;
        this._monitorsSigId   = 0;
        this._zoningSigId     = 0;
    }

    enable() {
        log('Enabling…');
		this._settingsManager = new SettingsManager(this.path);
        this._highlightManager= new HighlightManager(this._settingsManager);
        this._windowManager   = new WindowManager(this._settingsManager, this._highlightManager);
        this._indicator       = new Indicator(this.uuid, this._settingsManager, this);

        // Wire up window‐snapping signals
        this._windowManager.connectSignals();
        this._zoningSigId = this._settingsManager.connect(
            ENABLE_ZONING_KEY,
            () => {
                this._windowManager.connectSignals();
                this._indicator.updateToggleState();
            }
        );

        // Reinit highlighters on monitor change
        if (Main.layoutManager) {
            this._monitorsSigId = Main.layoutManager.connect(
                'monitors-changed',
                () => this._highlightManager.reinitHighlighters()
            );
        }

        // Register our new “cycle-zone-windows” keybinding
        Main.wm.addKeybinding(
            'cycle-zone-windows-accelerator',
            this._settingsManager.getGSettingObject(),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._windowManager.cycleWindowsInCurrentZone()
        );

        log('Enabled.');
    }

    disable() {
        log('Disabling…');

        if (this._monitorsSigId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._monitorsSigId);
            this._monitorsSigId = 0;
        }
        if (this._zoningSigId) {
            this._settingsManager.getGSettingObject().disconnect(this._zoningSigId);
            this._zoningSigId = 0;
        }

        Main.wm.removeKeybinding('cycle-zone-windows-accelerator');

        this._windowManager.cleanupWindowProperties();
        this._windowManager.destroy();
        this._highlightManager.destroy();
        this._indicator.destroy();
        this._settingsManager.destroy();

        log('Disabled.');
    }
}

