import * as Main from 'resource:///org/gnome/shell/ui/main.js'; 
const log = (prefix, msg) => console.log(`[AutoZoner.ZoneDetector.${prefix}] ${msg}`); 

function isPointInsideRect(point, rect) {
    const check = point.x >= rect.x && point.x <= rect.x + rect.width && 
                  point.y >= rect.y && point.y <= rect.y + rect.height; 
    // log('isPointInsideRect', `Point: ${JSON.stringify(point)}, Rect: ${JSON.stringify(rect)}, Result: ${check}`); 
    return check; 
}

function getMonitorWorkArea(monitorIndex) {
    if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) { 
        const primaryIndex = Main.layoutManager.primaryIndex; 
        // log('getMonitorWorkArea', `Invalid index ${monitorIndex}, using primary ${primaryIndex}`); 
        return Main.layoutManager.getWorkAreaForMonitor(primaryIndex); 
    }
    // log('getMonitorWorkArea', `Using index ${monitorIndex}`); 
    return Main.layoutManager.getWorkAreaForMonitor(monitorIndex); 
}

export class ZoneDetector {
    constructor() {
        // log('constructor', 'Initialized'); 
    }

    findTargetZone(activeZones, point, monitorIndex) { // Takes activeZones directly 
        const workArea = getMonitorWorkArea(monitorIndex); 
        log('findTargetZone', `Searching on monitor ${monitorIndex} (WorkArea: X:${workArea.x} Y:${workArea.y} W:${workArea.width} H:${workArea.height}) for point X:${point.x} Y:${point.y}`); 
        log('findTargetZone', `Available zones for this search: ${JSON.stringify(activeZones.filter(z => z.monitorIndex === monitorIndex))}`); 
        for (const zone of activeZones) { 
            if (zone.monitorIndex === monitorIndex) { 
                const absoluteZoneRect = { 
                    x: workArea.x + zone.x, 
                    y: workArea.y + zone.y, 
                    width: zone.width, 
                    height: zone.height 
                };
                log('findTargetZone', `Checking zone "${zone.name || 'Unnamed'}": AbsRect: X:${absoluteZoneRect.x} Y:${absoluteZoneRect.y} W:${absoluteZoneRect.width} H:${absoluteZoneRect.height}`); 
                if (isPointInsideRect(point, absoluteZoneRect)) { 
                    log('findTargetZone', `Point IS INSIDE zone "${zone.name || 'Unnamed'}"`); 
                    return zone; 
                } else { 
                    // log('findTargetZone', `Point is NOT inside zone "${zone.name || 'Unnamed'}"`); 
                }
            }
        }
        log('findTargetZone', `No target zone found for point X:${point.x} Y:${point.y} on monitor ${monitorIndex}`); 
        return null; 
    }
}
