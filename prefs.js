// prefs.js

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ZONE_SETTINGS_KEY        = 'zones';
const ENABLE_ZONING_KEY        = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY    = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY     = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY   = 'highlight-on-hover';

const log = (msg) => console.log(`[AutoZonerPrefs] ${msg}`);

class ZoneEditorGrid extends Gtk.Grid {
    static {
        GObject.registerClass({ Signals: { 'changed': {} } }, this);
    }

    constructor(zoneData, monitorCount) {
        super({
            column_spacing: 12, row_spacing: 6,
            margin_top: 10, margin_bottom: 10,
            margin_start: 10, margin_end: 10,
            hexpand: true,
        });

        this._zone = { ...zoneData };

        // Name
        this.attach(
            new Gtk.Label({ label: _('Name:'), halign: Gtk.Align.END, hexpand: false }),
            0, 0, 1, 1
        );
        this._nameEntry = new Gtk.Entry({ text: this._zone.name || '', hexpand: true });
        this._nameEntry.connect('changed', () => {
            this._zone.name = this._nameEntry.get_text();
            this.emit('changed');
        });
        this.attach(this._nameEntry, 1, 0, 3, 1);

        // Monitor index
        this.attach(
            new Gtk.Label({ label: _('Monitor Index:'), halign: Gtk.Align.END }),
            0, 1, 1, 1
        );
        this._monitorSpin = Gtk.SpinButton.new_with_range(0, Math.max(0, monitorCount - 1), 1);
        this._monitorSpin.set_value(this._zone.monitorIndex || 0);
        this._monitorSpin.connect('value-changed', () => {
            this._zone.monitorIndex = this._monitorSpin.get_value_as_int();
            this.emit('changed');
        });
        this.attach(this._monitorSpin, 1, 1, 1, 1);

        // X, Y, Width, Height
        const fields = [
            { label: _('X:'),     key: 'x' },
            { label: _('Y:'),     key: 'y' },
            { label: _('Width:'), key: 'width' },
            { label: _('Height:'),key: 'height' }
        ];
        fields.forEach((field, i) => {
            const row = Math.floor(i / 2) + 2;
            const col = (i % 2) * 2;

            this.attach(
                new Gtk.Label({ label: field.label, halign: Gtk.Align.END }),
                col, row, 1, 1
            );
            const spin = Gtk.SpinButton.new_with_range(0, 10000, 10);
            spin.set_value(this._zone[field.key] || 0);
            spin.set_hexpand(true);
            spin.connect('value-changed', () => {
                this._zone[field.key] = spin.get_value_as_int();
                this.emit('changed');
            });
            this.attach(spin, col + 1, row, 1, 1);
        });
    }

    get_zone_data() {
        return { ...this._zone };
    }
}

export default class AutoZonerPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window   = window;

        // Count monitors
        const display      = Gdk.Display.get_default();
        const monitors     = display.get_monitors();
        const monitorCount = monitors.get_n_items();

        // Preferences page
        const page = new Adw.PreferencesPage();
        window.add(page);

        // --- General Settings ---
        const generalGroup = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(generalGroup);

        // Enable auto zoning
        const enableSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(
            ENABLE_ZONING_KEY, enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT
        );
        const enableRow = new Adw.ActionRow({
            title: _('Enable Auto Zoning'),
            subtitle: _('Globally enable or disable the extension'),
            activatable_widget: enableSwitch
        });
        enableRow.add_suffix(enableSwitch);
        generalGroup.add(enableRow);

        // Highlight on hover
        const highlightSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(
            HIGHLIGHT_ON_HOVER_KEY, highlightSwitch, 'active', Gio.SettingsBindFlags.DEFAULT
        );
        const highlightRow = new Adw.ActionRow({
            title: _('Highlight Zone on Hover'),
            subtitle: _('Visually highlight a zone when dragging a window over it'),
            activatable_widget: highlightSwitch
        });
        highlightRow.add_suffix(highlightSwitch);
        generalGroup.add(highlightRow);

        // Restore size on untile
        const restoreSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(
            RESTORE_ON_UNTILE_KEY, restoreSwitch, 'active', Gio.SettingsBindFlags.DEFAULT
        );
        const restoreRow = new Adw.ActionRow({
            title: _('Restore Original Size on Untile'),
            subtitle: _('Restore size/position when moving out of all zones'),
            activatable_widget: restoreSwitch
        });
        restoreRow.add_suffix(restoreSwitch);
        generalGroup.add(restoreRow);

        // Tile new windows
        const newWindowsSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(
            TILE_NEW_WINDOWS_KEY, newWindowsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT
        );
        const newWindowsRow = new Adw.ActionRow({
            title: _('Tile New Windows'),
            subtitle: _('Automatically tile newly opened windows if they fall into a zone'),
            activatable_widget: newWindowsSwitch
        });
        newWindowsRow.add_suffix(newWindowsSwitch);
        generalGroup.add(newWindowsRow);

        // --- Zone Definitions ---
        this._zonesGroup = new Adw.PreferencesGroup({
            title: _('Zone Definitions'),
            description: _('Define areas on your screen where windows will automatically tile.')
        });
        page.add(this._zonesGroup);

        // Initial zone rows
        this._loadZonesToUI(monitorCount);

        // “Add New Zone” button
        this._addButtonRow = new Adw.ActionRow();
        const addButton = new Gtk.Button({
            label: _('Add New Zone'),
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action']
        });
        addButton.connect('clicked', () => this._addZone(monitorCount));
        this._addButtonRow.set_child(addButton);
        this._zonesGroup.add(this._addButtonRow);
    }

    _loadZonesToUI(monitorCount) {
        // Parse zones JSON
        const zonesJson = this._settings.get_string(ZONE_SETTINGS_KEY);
        let zones = [];
        try {
            zones = JSON.parse(zonesJson);
            if (!Array.isArray(zones)) zones = [];
        } catch (e) {
            log(`Error parsing zones JSON: ${e}`);
            zones = [];
        }

        // Add one ExpanderRow per zone
        zones.forEach(zoneData =>
            this._createAndAddZoneExpander(zoneData, monitorCount)
        );
    }

    _createAndAddZoneExpander(zoneData, monitorCount) {
        const editorGrid = new ZoneEditorGrid(zoneData, monitorCount);
        const expanderRow = new Adw.ExpanderRow({
            title: zoneData.name || _('Unnamed Zone'),
            subtitle: `X:${zoneData.x}, Y:${zoneData.y}, W:${zoneData.width}, H:${zoneData.height}, M:${zoneData.monitorIndex + 1}`
        });
        expanderRow.add_row(editorGrid);

        // Remove button
        const removeButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _("Remove Zone"),
            css_classes: ['flat', 'circular']
        });
        expanderRow.add_suffix(removeButton);
        expanderRow.set_enable_expansion(true);

        // Save on change
        editorGrid.connect('changed', () => {
            const cd = editorGrid.get_zone_data();
            expanderRow.title    = cd.name;
            expanderRow.subtitle = `X:${cd.x}, Y:${cd.y}, W:${cd.width}, H:${cd.height}, M:${cd.monitorIndex + 1}`;
            this._saveZones();
        });

        // Confirm removal
        removeButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                heading: _("Remove Zone?"),
                body:    _("Remove “%s”?").format(expanderRow.title),
                transient_for: this._window,
                modal: true
            });
            dialog.add_response("cancel", _("Cancel"));
            dialog.add_response("remove", _("Remove"));
            dialog.set_response_appearance("remove", Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect("response", (d, resp) => {
                if (resp === "remove") {
                    this._zonesGroup.remove(expanderRow);
                    this._saveZones();
                }
                d.destroy();
            });
            dialog.present();
        });

        // Insert before “Add” if present
        if (this._addButtonRow)
            this._zonesGroup.add_before(expanderRow, this._addButtonRow);
        else
            this._zonesGroup.add(expanderRow);
    }

    _addZone(monitorCount) {
        const json = this._settings.get_string(ZONE_SETTINGS_KEY);
        let current = [];
        try { current = JSON.parse(json); } catch {}
        const idx = Array.isArray(current) ? current.length + 1 : 1;

        const nz = {
            monitorIndex: 0,
            name:         _('New Zone %d').format(idx),
            x: 0, y: 0, width: 1280, height: 720
        };
        this._createAndAddZoneExpander(nz, monitorCount);
        this._saveZones();
    }

    _saveZones() {
        const zones = [];
        for (let child of this._zonesGroup) {
            if (child instanceof Adw.ExpanderRow && child.get_n_rows() > 0) {
                const grid = child.get_row_at_index(0);
                zones.push(grid.get_zone_data());
            }
        }
        this._settings.set_string(ZONE_SETTINGS_KEY, JSON.stringify(zones));
        log(`Saved ${zones.length} zones.`);
    }
}

