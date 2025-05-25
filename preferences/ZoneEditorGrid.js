// ./preferences/ZoneEditorGrid.js
import Gtk from 'gi://Gtk'; // [cite: 512]
import GObject from 'gi://GObject'; // [cite: 512]
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // [cite: 513]

export class ZoneEditorGrid extends Gtk.Grid {
    static {
        GObject.registerClass({ Signals: { 'changed': {} } }, this); // [cite: 531]
    }

    constructor(zoneData, monitorCount) {
        super({ // [cite: 532]
            column_spacing: 12, // [cite: 532]
            row_spacing: 6, // [cite: 532]
            margin_top: 10, // [cite: 532]
            margin_bottom: 10, // [cite: 532]
            margin_start: 10, // [cite: 532]
            margin_end: 10, // [cite: 532]
            hexpand: true, // [cite: 533]
        });
        this._zone = { ...zoneData }; // [cite: 533]
        this.attach(new Gtk.Label({ label: _('Name:'), halign: Gtk.Align.END }), 0, 0, 1, 1); // [cite: 534]
        this._nameEntry = new Gtk.Entry({ text: this._zone.name || '', hexpand: true }); // [cite: 535]
        this._nameEntry.connect('changed', () => { // [cite: 535]
            this._zone.name = this._nameEntry.get_text(); // [cite: 536]
            this.emit('changed'); // [cite: 536]
        });
        this.attach(this._nameEntry, 1, 0, 3, 1); // [cite: 537]

        this.attach(new Gtk.Label({ label: _('Monitor Index:'), halign: Gtk.Align.END }), 0, 1, 1, 1); // [cite: 537]
        this._monitorSpin = Gtk.SpinButton.new_with_range(0, Math.max(0, monitorCount - 1), 1); // [cite: 538]
        this._monitorSpin.set_value(this._zone.monitorIndex || 0); // [cite: 538]
        this._monitorSpin.connect('value-changed', () => { // [cite: 539]
            this._zone.monitorIndex = this._monitorSpin.get_value_as_int(); // [cite: 539]
            this.emit('changed'); // [cite: 539]
        });
        this.attach(this._monitorSpin, 1, 1, 1, 1); // [cite: 540]

        const fields = [ // [cite: 540]
            { label: _('X:'), key: 'x' }, { label: _('Y:'), key: 'y' }, // [cite: 540]
            { label: _('Width:'), key: 'width' }, { label: _('Height:'), key: 'height' } // [cite: 540]
        ];
        fields.forEach((f, i) => { // [cite: 541]
            const row = Math.floor(i / 2) + 2; // [cite: 541]
            const col = (i % 2) * 2; // [cite: 541]
            this.attach(new Gtk.Label({ label: f.label, halign: Gtk.Align.END }), col, row, 1, 1); // [cite: 541]
            const spin = Gtk.SpinButton.new_with_range(0, 10000, 10); // [cite: 541]
            spin.set_value(this._zone[f.key] || 0); // [cite: 541]
            spin.set_hexpand(true); // [cite: 542]
            spin.connect('value-changed', () => { // [cite: 542]
                this._zone[f.key] = spin.get_value_as_int(); // [cite: 542]
                this.emit('changed'); // [cite: 542]
            });
            this.attach(spin, col + 1, row, 1, 1); // [cite: 542]
        });
    }

    get_zone_data() {
        return { ...this._zone }; // [cite: 543]
    }
}
