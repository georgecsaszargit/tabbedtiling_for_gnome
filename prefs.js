// prefs.js

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences, gettext as _ } from
        'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ZONE_SETTINGS_KEY = 'zones';
const ENABLE_ZONING_KEY = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY = 'highlight-on-hover';
const CYCLE_ACCELERATOR_KEY = 'cycle-zone-windows-accelerator';
const CYCLE_BACKWARD_ACCELERATOR_KEY = 'cycle-zone-windows-backward-accelerator';
const TAB_BAR_HEIGHT_KEY = 'tab-bar-height';
const TAB_FONT_SIZE_KEY = 'tab-font-size';
const ZONE_GAP_SIZE_KEY = 'zone-gap-size';

// New Tab Bar Adjustment Keys
const TAB_ICON_SIZE_KEY = 'tab-icon-size';
const TAB_CORNER_RADIUS_KEY = 'tab-corner-radius';
const TAB_CLOSE_BUTTON_ICON_SIZE_KEY = 'tab-close-button-icon-size';
const TAB_SPACING_KEY = 'tab-spacing';
const TAB_MIN_WIDTH_KEY = 'tab-min-width';
const TAB_MAX_WIDTH_KEY = 'tab-max-width';


const log = msg => console.log(`[AutoZonerPrefs] ${msg}`);

class ZoneEditorGrid extends Gtk.Grid {
    static {
        GObject.registerClass({ Signals: { 'changed': {} } }, this);
    }

    constructor(zoneData, monitorCount) {
        super({
            column_spacing: 12,
            row_spacing: 6,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
            hexpand: true,
        });
        this._zone = { ...zoneData };

        this.attach(new Gtk.Label({ label: _('Name:'), halign: Gtk.Align.END }), 0, 0, 1, 1);
        this._nameEntry = new Gtk.Entry({ text: this._zone.name || '', hexpand: true });
        this._nameEntry.connect('changed', () => {
            this._zone.name = this._nameEntry.get_text();
            this.emit('changed');
        });
        this.attach(this._nameEntry, 1, 0, 3, 1);

        this.attach(new Gtk.Label({ label: _('Monitor Index:'), halign: Gtk.Align.END }), 0, 1, 1, 1);
        this._monitorSpin = Gtk.SpinButton.new_with_range(0, Math.max(0, monitorCount - 1), 1);
        this._monitorSpin.set_value(this._zone.monitorIndex || 0);
        this._monitorSpin.connect('value-changed', () => {
            this._zone.monitorIndex = this._monitorSpin.get_value_as_int();
            this.emit('changed');
        });
        this.attach(this._monitorSpin, 1, 1, 1, 1);

        const fields = [
            { label: _('X:'), key: 'x' }, { label: _('Y:'), key: 'y' },
            { label: _('Width:'), key: 'width' }, { label: _('Height:'), key: 'height' }
        ];
        fields.forEach((f, i) => {
            const row = Math.floor(i / 2) + 2;
            const col = (i % 2) * 2;
            this.attach(new Gtk.Label({ label: f.label, halign: Gtk.Align.END }), col, row, 1, 1);
            const spin = Gtk.SpinButton.new_with_range(0, 10000, 10);
            spin.set_value(this._zone[f.key] || 0);
            spin.set_hexpand(true);
            spin.connect('value-changed', () => {
                this._zone[f.key] = spin.get_value_as_int();
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
        this._window = window;

        const display = Gdk.Display.get_default();
        const monitorCount = display.get_monitors().get_n_items();
        const page = new Adw.PreferencesPage();
        window.add(page);

        // General Settings Group
        const generalGroup = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(generalGroup);

        const enableSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(ENABLE_ZONING_KEY, enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const enableRow = new Adw.ActionRow({
            title: _('Enable Auto Zoning'),
            subtitle: _('Globally enable or disable the extension'),
            activatable_widget: enableSwitch
        });
        enableRow.add_suffix(enableSwitch);
        generalGroup.add(enableRow);

        const hoverSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(HIGHLIGHT_ON_HOVER_KEY, hoverSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const hoverRow = new Adw.ActionRow({
            title: _('Highlight Zone on Hover'),
            subtitle: _('Visually highlight a zone when dragging a window over it'),
            activatable_widget: hoverSwitch
        });
        hoverRow.add_suffix(hoverSwitch);
        generalGroup.add(hoverRow);

        const restoreSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(RESTORE_ON_UNTILE_KEY, restoreSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const restoreRow = new Adw.ActionRow({
            title: _('Restore Original Size on Untile'),
            subtitle: _('When a window leaves all zones, restore its original size/position'),
            activatable_widget: restoreSwitch
        });
        restoreRow.add_suffix(restoreSwitch);
        generalGroup.add(restoreRow);

        const tileSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        this._settings.bind(TILE_NEW_WINDOWS_KEY, tileSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const tileRow = new Adw.ActionRow({
            title: _('Tile New Windows'),
            subtitle: _('Automatically tile newly opened windows if they fall into a zone'),
            activatable_widget: tileSwitch
        });
        tileRow.add_suffix(tileSwitch);
        generalGroup.add(tileRow);

        const accelEntry = new Gtk.Entry({
            hexpand: true,
            placeholder_text: '<Control><Alt>8'
        });
        const existing = this._settings.get_strv(CYCLE_ACCELERATOR_KEY);
        accelEntry.set_text(existing[0] || '');
        accelEntry.connect('activate', () => {
            const text = accelEntry.get_text().trim();
            if (text) {
                this._settings.set_strv(CYCLE_ACCELERATOR_KEY, [text]);
                log(`Saved cycle shortcut: ${text}`);
            }
        });
        const accelRow = new Adw.ActionRow({
            title: _('Cycle Zone Windows Shortcut'),
            subtitle: _('Type accelerator (e.g. <Control><Alt>8) then Enter'),
            activatable_widget: accelEntry
        });
        accelRow.add_suffix(accelEntry);
        generalGroup.add(accelRow);

        const backwardAccelEntry = new Gtk.Entry({
            hexpand: true,
            placeholder_text: '<Control><Alt>9'
        });
        const existingBackward = this._settings.get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY);
        backwardAccelEntry.set_text(existingBackward[0] || '');
        backwardAccelEntry.connect('activate', () => {
            const text = backwardAccelEntry.get_text().trim();
            if (text) {
                this._settings.set_strv(CYCLE_BACKWARD_ACCELERATOR_KEY, [text]);
                log(`Saved backward cycle shortcut: ${text}`);
            }
        });
        const backwardAccelRow = new Adw.ActionRow({
            title: _('Cycle Zone Windows Backward Shortcut'),
            subtitle: _('Type accelerator (e.g. <Control><Alt>9) then Enter'),
            activatable_widget: backwardAccelEntry
        });
        backwardAccelRow.add_suffix(backwardAccelEntry);
        generalGroup.add(backwardAccelRow);

        const heightSpin = Gtk.SpinButton.new_with_range(16, 200, 1);
        heightSpin.set_value(this._settings.get_int(TAB_BAR_HEIGHT_KEY));
        heightSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_BAR_HEIGHT_KEY, heightSpin.get_value_as_int());
        });
        const heightRow = new Adw.ActionRow({
            title: _('Tab Bar Height (px)'),
            subtitle: _('Height in pixels for the tab bar'),
            activatable_widget: heightSpin
        });
        heightRow.add_suffix(heightSpin);
        generalGroup.add(heightRow);

        const fontSpin = Gtk.SpinButton.new_with_range(6, 72, 1); // Already existed
        fontSpin.set_value(this._settings.get_int(TAB_FONT_SIZE_KEY));
        fontSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_FONT_SIZE_KEY, fontSpin.get_value_as_int());
        });
        const fontRow = new Adw.ActionRow({
            title: _('Tab Font Size (px)'), // Already existed
            subtitle: _('Font size in pixels for the tab labels'),
            activatable_widget: fontSpin
        });
        fontRow.add_suffix(fontSpin);
        generalGroup.add(fontRow);

        const gapSpin = Gtk.SpinButton.new_with_range(0, 50, 1);
        gapSpin.set_value(this._settings.get_int(ZONE_GAP_SIZE_KEY));
        gapSpin.connect('value-changed', () => {
            this._settings.set_int(ZONE_GAP_SIZE_KEY, gapSpin.get_value_as_int());
        });
        const gapRow = new Adw.ActionRow({
            title: _('Zone Gap Size (px)'),
            subtitle: _('Gap around zones. 0 for no gaps. Re-snap windows to apply.'),
            activatable_widget: gapSpin
        });
        gapRow.add_suffix(gapSpin);
        generalGroup.add(gapRow);


        // Tab Bar Adjustments Group (New)
        const tabBarGroup = new Adw.PreferencesGroup({ title: _('Tab Bar Adjustments') });
        page.add(tabBarGroup);

        // Tab Icon Size
        const tabIconSizeSpin = Gtk.SpinButton.new_with_range(8, 64, 1);
        tabIconSizeSpin.set_value(this._settings.get_int(TAB_ICON_SIZE_KEY));
        tabIconSizeSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_ICON_SIZE_KEY, tabIconSizeSpin.get_value_as_int());
        });
        const tabIconSizeRow = new Adw.ActionRow({
            title: _('Tab Icon Size (px)'),
            subtitle: _('Size for application icons in tabs'),
            activatable_widget: tabIconSizeSpin
        });
        tabIconSizeRow.add_suffix(tabIconSizeSpin);
        tabBarGroup.add(tabIconSizeRow);

        // Tab Corner Radius
        const tabCornerRadiusSpin = Gtk.SpinButton.new_with_range(0, 20, 1);
        tabCornerRadiusSpin.set_value(this._settings.get_int(TAB_CORNER_RADIUS_KEY));
        tabCornerRadiusSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_CORNER_RADIUS_KEY, tabCornerRadiusSpin.get_value_as_int());
        });
        const tabCornerRadiusRow = new Adw.ActionRow({
            title: _('Tab Corner Radius (px)'),
            subtitle: _('Radius for the top corners of tabs'),
            activatable_widget: tabCornerRadiusSpin
        });
        tabCornerRadiusRow.add_suffix(tabCornerRadiusSpin);
        tabBarGroup.add(tabCornerRadiusRow);

        // Tab Close Button Icon Size
        const tabCloseButtonIconSizeSpin = Gtk.SpinButton.new_with_range(8, 32, 1);
        tabCloseButtonIconSizeSpin.set_value(this._settings.get_int(TAB_CLOSE_BUTTON_ICON_SIZE_KEY));
        tabCloseButtonIconSizeSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_CLOSE_BUTTON_ICON_SIZE_KEY, tabCloseButtonIconSizeSpin.get_value_as_int());
        });
        const tabCloseButtonIconSizeRow = new Adw.ActionRow({
            title: _('Tab Close Button Icon Size (px)'),
            subtitle: _('Size for the close icon in tabs'),
            activatable_widget: tabCloseButtonIconSizeSpin
        });
        tabCloseButtonIconSizeRow.add_suffix(tabCloseButtonIconSizeSpin);
        tabBarGroup.add(tabCloseButtonIconSizeRow);

        // Tab Spacing
        const tabSpacingSpin = Gtk.SpinButton.new_with_range(0, 50, 1);
        tabSpacingSpin.set_value(this._settings.get_int(TAB_SPACING_KEY));
        tabSpacingSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_SPACING_KEY, tabSpacingSpin.get_value_as_int());
        });
        const tabSpacingRow = new Adw.ActionRow({
            title: _('Tab Spacing (px)'),
            subtitle: _('Gap between individual tabs'),
            activatable_widget: tabSpacingSpin
        });
        tabSpacingRow.add_suffix(tabSpacingSpin);
        tabBarGroup.add(tabSpacingRow);

        // Tab Min Width
        const tabMinWidthSpin = Gtk.SpinButton.new_with_range(30, 300, 5);
        tabMinWidthSpin.set_value(this._settings.get_int(TAB_MIN_WIDTH_KEY));
        tabMinWidthSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_MIN_WIDTH_KEY, tabMinWidthSpin.get_value_as_int());
        });
        const tabMinWidthRow = new Adw.ActionRow({
            title: _('Tab Minimum Width (px)'),
            subtitle: _('Smallest width a tab can shrink to'),
            activatable_widget: tabMinWidthSpin
        });
        tabMinWidthRow.add_suffix(tabMinWidthSpin);
        tabBarGroup.add(tabMinWidthRow);

        // Tab Max Width
        const tabMaxWidthSpin = Gtk.SpinButton.new_with_range(50, 500, 5);
        tabMaxWidthSpin.set_value(this._settings.get_int(TAB_MAX_WIDTH_KEY));
        tabMaxWidthSpin.connect('value-changed', () => {
            this._settings.set_int(TAB_MAX_WIDTH_KEY, tabMaxWidthSpin.get_value_as_int());
        });
        const tabMaxWidthRow = new Adw.ActionRow({
            title: _('Tab Maximum Width (px)'),
            subtitle: _('Largest width a tab can expand to'),
            activatable_widget: tabMaxWidthSpin
        });
        tabMaxWidthRow.add_suffix(tabMaxWidthSpin);
        tabBarGroup.add(tabMaxWidthRow);


        // Zone Definitions Group
        this._zonesGroup = new Adw.PreferencesGroup({
            title: _('Zone Definitions'),
            description: _('Define screen areas where windows will tile automatically.')
        });
        page.add(this._zonesGroup);

        this._loadZonesToUI(monitorCount);

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
        let child = this._zonesGroup.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            if (child instanceof Adw.ExpanderRow)
                this._zonesGroup.remove(child);
            child = next;
        }

        let zones = [];
        try {
            zones = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY));
            if (!Array.isArray(zones)) zones = [];
        } catch (e) {
            log(`Error parsing zones JSON: ${e}`);
            zones = [];
        }

        zones.forEach(zoneData => this._createAndAddZoneExpander(zoneData, monitorCount));
    }

    _createAndAddZoneExpander(zoneData, monitorCount) {
        const editorGrid = new ZoneEditorGrid(zoneData, monitorCount);
        const expanderRow = new Adw.ExpanderRow({
            title: zoneData.name || _('Unnamed Zone'),
            subtitle: `X:${zoneData.x}, Y:${zoneData.y}, W:${zoneData.width}, H:${zoneData.height}, M:${zoneData.monitorIndex + 1}`
        });
        expanderRow.add_row(editorGrid);

        const removeButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _("Remove this zone"),
            css_classes: ['flat', 'circular']
        });
        expanderRow.add_suffix(removeButton);
        expanderRow.set_enable_expansion(true);

        editorGrid.connect('changed', () => {
            const cd = editorGrid.get_zone_data();
            expanderRow.title = cd.name || _('Unnamed Zone');
            expanderRow.subtitle = `X:${cd.x}, Y:${cd.y}, W:${cd.width}, H:${cd.height}, M:${cd.monitorIndex + 1}`;
            this._saveZones();
        });
        removeButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                heading: _("Remove Zone?"),
                body: _("Are you sure you want to remove “%s”?").format(expanderRow.title),
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
        if (this._addButtonRow)
            this._zonesGroup.add_before(expanderRow, this._addButtonRow);
        else
            this._zonesGroup.add(expanderRow);
    }

    _addZone(monitorCount) {
        let current = [];
        try {
            current = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY)) || [];
        } catch {}
        const idx = current.length + 1;
        const newZone = {
            monitorIndex: 0,
            name: _('New Zone %d').format(idx),
            x: 0, y: 0, width: 1280, height: 720
        };
        this._createAndAddZoneExpander(newZone, monitorCount);
        this._saveZones();
    }

    _saveZones() {
        const zones = [];
        let child = this._zonesGroup.get_first_child();
        while (child) {
            if (child instanceof Adw.ExpanderRow && child.get_n_rows() > 0) {
                const grid = child.get_row_at_index(0);
                zones.push(grid.get_zone_data());
            }
            child = child.get_next_sibling();
        }
        this._settings.set_string(ZONE_SETTINGS_KEY, JSON.stringify(zones));
        log(`Saved ${zones.length} zones.`);
    }
}
