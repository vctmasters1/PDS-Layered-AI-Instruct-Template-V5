# HEADER_ID Feature Implementation

## ? Changes Completed

### 1?? **Platform Editor (`platform-editor-v2.html`)**

#### **New Column Added**
- **HEADER_ID** column added to pin matrix
- Positioned between Physical Pin and Group columns
- Editable text field (like physical pin and group)
- Default value: "J1"
- Color: Orange (`#e67e22`)

#### **Visual Layout**
```
?????????????????????????????????????????????????????????????????????????
? Header   ? Physical ? Group        ? Pin Name   ? Capabilities        ?
? (edit)   ? (edit)   ? (edit text)  ? (edit)     ? [Buttons]           ?
? J1       ? 1        ? Power        ? VIN        ? [VIN]               ?
? J1       ? 2        ? Power        ? GND        ? [GND]               ?
? J2       ? 1        ? GPIO         ? GPIO0      ? [GPIO][ADC]         ?
?????????????????????????????????????????????????????????????????????????
```

#### **Features**
- ? Editable inline (click to edit)
- ? Sortable (click header to sort)
- ? Multi-column sort support (1=Header, 2=Physical, 3=Group, 4=Name)
- ? Included in JSON export
- ? Imported from JSON
- ? Color-coded for visibility

#### **JSON Structure**
```json
{
  "pin_capabilities": [
    {
      "pin": 0,
      "header_id": "J1",
      "physical_pin": "1",
      "group": "Power",
      "name": "VIN",
      "capabilities": ["VIN"]
    },
    {
      "pin": 20,
      "header_id": "J2",
      "physical_pin": "1",
      "group": "GPIO",
      "name": "GPIO0 / BOOT",
      "capabilities": ["GPIO", "ADC"]
    }
  ]
}
```

#### **Research Prompt Updated**
- Now requests `header_id` for each pin
- Explains multi-connector boards (J1, J2, etc.)
- Notes that physical pins restart at "1" for each header

---

### 2?? **Pinout Leaf Generator** ? **NEXT STEP**

**Planned Features:**
- Generate **separate diagrams** for each unique `header_id`
- Group pins by `header_id` automatically
- Display header name on each diagram
- Support multiple connector layouts

**Example Output:**
```
???????????????????????
?  J1 - Main Header   ?
???????????????????????
? 1  ? VIN            ?
? 2  ? GND            ?
? 3  ? 3V3            ?
???????????????????????

???????????????????????
?  J2 - GPIO Header   ?
???????????????????????
? 1  ? GPIO0 / BOOT   ?
? 2  ? GPIO1 / ADC    ?
? 3  ? GPIO2 / I2C    ?
???????????????????????
```

---

## ?? Use Cases

### **Single Connector Board**
- ESP32-C3 DevKit: All pins on "J1" (or "Main")
- Arduino Nano: All pins on "J1"

### **Multi-Connector Board**
- Raspberry Pi: "J1" (40-pin GPIO), "J2" (camera), "J3" (display)
- Custom carrier board: "J1" (power), "J2" (I/O), "J3" (sensors)
- Industrial PLC: "J1", "J2", "J3", "J4" (multiple terminal blocks)

### **Complex Boards**
- Renesas development boards with multiple headers
- Custom PCBs with separated power, I/O, and communication connectors

---

## ?? Sorting Examples

### **By Header + Physical Pin** (Recommended)
```
Sort by: 1,2 (Header, Physical)
```
Result:
```
J1-1, J1-2, J1-3, ..., J2-1, J2-2, J2-3, ...
```

### **By Header + Group**
```
Sort by: 1,3 (Header, Group)
```
Result:
```
J1-Power, J1-GPIO, J1-Communication, ..., J2-Power, J2-GPIO, ...
```

---

## ?? Migration Path

### **Existing JSON Files**
- Old JSON without `header_id` will still work
- Import will default to `header_id: "J1"`
- Re-export will add `header_id` field

### **Example Migration**
```json
// OLD FORMAT (still works)
{
  "pin": 0,
  "physical_pin": "1",
  "name": "VIN",
  "capabilities": ["VIN"]
}

// NEW FORMAT (recommended)
{
  "pin": 0,
  "header_id": "J1",
  "physical_pin": "1",
  "group": "Power",
  "name": "VIN",
  "capabilities": ["VIN"]
}
```

---

## ?? Next Steps

### **Immediate** ? **DONE**
- [x] Add HEADER_ID column to platform editor
- [x] Update JSON structure
- [x] Update research prompt
- [x] Add sorting support

### **Next** ? **TODO**
- [ ] Update `pinout-leaf-generator.html`
  - Group pins by `header_id`
  - Generate separate SVG for each header
  - Add header selection UI
  - Export all headers or selected ones

### **Future** ?? **PLANNED**
- [ ] Visual header layout editor
- [ ] Custom header shapes (dual-row, single-row, grid)
- [ ] Auto-detect common header types (40-pin GPIO, JST, etc.)

---

## ?? Testing Checklist

- [x] ? Add pin with custom header_id
- [x] ? Sort by header
- [x] ? Multi-column sort (header + physical)
- [x] ? Export JSON with header_id
- [x] ? Import JSON with header_id
- [ ] ? Generate separate pinout diagrams per header (next step)

---

**Last Updated**: February 4, 2026  
**Version**: 2.1  
**Status**: Platform Editor complete, Pinout Generator pending
