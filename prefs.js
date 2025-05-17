import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ZONE_SETTINGS_KEY = 'zones';
const ENABLE_ZONING_KEY = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY = 'highlight-on-hover'; // NEW

const log = (msg) => console.log(`[AutoZonerPrefs] ${msg}`);

class ZoneEditorGrid extends Gtk.Grid { // (Keep this class as is from previous response)
    static {
        GObject.registerClass({ Signals: { 'changed': {} } }, this);
    }
    constructor(zoneData, monitorCount) {
        super({ column_spacing: 12, row_spacing: 6, margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10, hexpand: true });
        this._zone = { ...zoneData };
        this.attach(new Gtk.Label({ label: _('Name:'), halign: Gtk.Align.END, hexpand: false }), 0, 0, 1, 1);
        this._nameEntry = new Gtk.Entry({ text: this._zone.name || '', hexpand: true });
        this._nameEntry.connect('changed', () => { this._zone.name = this._nameEntry.get_text(); this.emit('changed'); });
        this.attach(this._nameEntry, 1, 0, 3, 1);
        this.attach(new Gtk.Label({ label: _('Monitor Index:'), halign: Gtk.Align.END }), 0, 1, 1, 1);
        this._monitorSpin = Gtk.SpinButton.new_with_range(0, Math.max(0, monitorCount - 1), 1);
        this._monitorSpin.set_value(this._zone.monitorIndex || 0);
        this._monitorSpin.connect('value-changed', () => { this._zone.monitorIndex = this._monitorSpin.get_value_as_int(); this.emit('changed'); });
        this.attach(this._monitorSpin, 1, 1, 1, 1);
        const fields = [ { label: _('X:'), key: 'x' }, { label: _('Y:'), key: 'y' }, { label: _('Width:'), key: 'width' }, { label: _('Height:'), key: 'height' }];
        fields.forEach((field, index) => {
            const row = Math.floor(index / 2) + 2; const col = (index % 2) * 2;
            this.attach(new Gtk.Label({ label: field.label, halign: Gtk.Align.END }), col, row, 1, 1);
            const spin = Gtk.SpinButton.new_with_range(0, 10000, 10);
            spin.set_value(this._zone[field.key] || 0); spin.set_hexpand(true);
            spin.connect('value-changed', () => { this._zone[field.key] = spin.get_value_as_int(); this.emit('changed'); });
            this.attach(spin, col + 1, row, 1, 1);
        });
    }
    get_zone_data() { return { ...this._zone }; }
}

export default class AutoZonerPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window = window;

        const display = Gdk.Display.get_default();
        const monitors = display.get_monitors();
        const monitorCount = monitors.get_n_items();

        const page = new Adw.PreferencesPage();
        window.add(page);

        // General Group
        const generalGroup = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(generalGroup);

        let enableSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(ENABLE_ZONING_KEY, enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        let enableRow = new Adw.ActionRow({ title: _('Enable Auto Zoning'), subtitle: _('Globally enable or disable the extension'), activatable_widget: enableSwitch });
        enableRow.add_suffix(enableSwitch);
        generalGroup.add(enableRow);

        // NEW: Highlight on hover switch
        const highlightSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(HIGHLIGHT_ON_HOVER_KEY, highlightSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const highlightRow = new Adw.ActionRow({
            title: _('Highlight Zone on Hover'),
            subtitle: _('Visually highlight a zone when dragging a window over it'),
            activatable_widget: highlightSwitch
        });
        highlightRow.add_suffix(highlightSwitch);
        generalGroup.add(highlightRow); // Add this to the general group


        let restoreSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(RESTORE_ON_UNTILE_KEY, restoreSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        let restoreRow = new Adw.ActionRow({ title: _('Restore Original Size on Untile'), subtitle: _('When a window is moved out of all zones, restore its previous size and position'), activatable_widget: restoreSwitch });
        restoreRow.add_suffix(restoreSwitch);
        generalGroup.add(restoreRow);

        let newWindowsSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(TILE_NEW_WINDOWS_KEY, newWindowsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        let newWindowsRow = new Adw.ActionRow({ title: _('Tile New Windows'), subtitle: _('Automatically tile newly opened windows if their center falls into a zone'), activatable_widget: newWindowsSwitch });
        newWindowsRow.add_suffix(newWindowsSwitch);
        generalGroup.add(newWindowsRow);

        // Zones Group
        this._zonesGroup = new Adw.PreferencesGroup({ title: _('Zone Definitions'), description: _('Define areas on your screen where windows will automatically tile.') });
        page.add(this._zonesGroup);
        this._loadZonesToUI(monitorCount);
        this._addButtonRow = new Adw.ActionRow();
        const addButton = new Gtk.Button({ label: _('Add New Zone'), halign: Gtk.Align.CENTER, css_classes: ['suggested-action'] });
        addButton.connect('clicked', () => this._addZone(monitorCount));
        this._addButtonRow.set_child(addButton);
        this._zonesGroup.add(this._addButtonRow);
    }

    // (_loadZonesToUI, _createAndAddZoneExpander, _addZone, _saveZones methods remain the same as previous response)
    _loadZonesToUI(monitorCount) {
        const rowsToRemove = [];
        for (let i = 0; i < this._zonesGroup.get_n_children(); i++) {
            const child = this._zonesGroup.get_child_at_index(i);
            if (child instanceof Adw.ExpanderRow) rowsToRemove.push(child);
        }
        rowsToRemove.forEach(row => this._zonesGroup.remove(row));
        const zonesJson = this._settings.get_string(ZONE_SETTINGS_KEY);
        let zones = [];
        try { zones = JSON.parse(zonesJson); if (!Array.isArray(zones)) zones = []; }
        catch (e) { log(`Error parsing zones for UI: ${e}`); zones = []; }
        zones.forEach(zoneData => this._createAndAddZoneExpander(zoneData, monitorCount));
    }
    _createAndAddZoneExpander(zoneData, monitorCount) {
        const editorGrid = new ZoneEditorGrid(zoneData, monitorCount);
        const expanderRow = new Adw.ExpanderRow({ title: zoneData.name || _('Unnamed Zone'), subtitle: `X:${zoneData.x}, Y:${zoneData.y}, W:${zoneData.width}, H:${zoneData.height}, M:${zoneData.monitorIndex + 1}` });
        expanderRow.add_row(editorGrid);
        const removeButton = new Gtk.Button({ icon_name: 'edit-delete-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _("Remove Zone"), css_classes: ['flat', 'circular'] });
        expanderRow.add_suffix(removeButton); expanderRow.set_enable_expansion(true);
        editorGrid.connect('changed', () => {
            const cd = editorGrid.get_zone_data();
            expanderRow.title = cd.name || _('Unnamed Zone');
            expanderRow.subtitle = `X:${cd.x}, Y:${cd.y}, W:${cd.width}, H:${cd.height}, M:${cd.monitorIndex + 1}`;
            this._saveZones();
        });
        removeButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({ heading: _("Remove Zone?"), body: _("Are you sure you want to remove the zone “%s”?").format(expanderRow.title), transient_for: this._window, modal: true });
            dialog.add_response("cancel", _("Cancel")); dialog.add_response("remove", _("Remove"));
            dialog.set_response_appearance("remove", Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect("response", (s, resp) => { if (resp === "remove") { this._zonesGroup.remove(expanderRow); this._saveZones(); } dialog.destroy(); });
            dialog.present();
        });
        if (this._addButtonRow) this._zonesGroup.add_before(expanderRow, this._addButtonRow); else this._zonesGroup.add(expanderRow);
    }
    _addZone(monitorCount) {
        let zc = 0; for (let i = 0; i < this._zonesGroup.get_n_children(); i++) if (this._zonesGroup.get_child_at_index(i) instanceof Adw.ExpanderRow) zc++;
        const nz = { monitorIndex: 0, name: _('New Zone %d').format(zc + 1), x: 0, y: 0, width: 1280, height: 720 };
        this._createAndAddZoneExpander(nz, monitorCount); this._saveZones();
    }
    _saveZones() {
        const zones = [];
        for (let i = 0; i < this._zonesGroup.get_n_children(); i++) {
            const child = this._zonesGroup.get_child_at_index(i);
            if (child instanceof Adw.ExpanderRow && child.get_n_rows() > 0) {
                const eg = child.get_row_at_index(0); if (eg instanceof ZoneEditorGrid) zones.push(eg.get_zone_data());
            }
        }
        this._settings.set_string(ZONE_SETTINGS_KEY, JSON.stringify(zones)); log(`Saved ${zones.length} zones.`);
    }
}
