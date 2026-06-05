#!/usr/bin/env python3
"""
PDS Build System GUI - Pure Tkinter Implementation

This is a real Python GUI (not a browser).
Uses tkinter which comes built-in with Python.
Three-column selector + terminal output.
"""

import sys
import os
import json
import subprocess
import threading
from pathlib import Path
from queue import Queue
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox

# Setup
SCRIPT_DIR = Path(__file__).parent
CONFIG_DIR = SCRIPT_DIR / "config"
SCRIPTS_DIR = SCRIPT_DIR / "scripts"
HAL_DIR = SCRIPT_DIR.parent / "Device" / "pds" / "pds_hal" / "platform"

class BuildSystemGUI:
    """Main GUI application."""
    
    def __init__(self, root):
        self.root = root
        self.root.title("PDS Build System")
        self.root.geometry("1200x800")
        
        # Data
        self.boards = self.load_boards()
        self.output_queue = Queue()
        self.is_building = False
        
        # Build the UI
        self.setup_ui()
        
        # Start queue checker
        self.check_queue()
    
    def load_boards(self):
        """Load boards and their hwrevs from HAL directory structure."""
        boards = {}

        if not HAL_DIR.exists():
            messagebox.showerror("Error", f"HAL directory not found: {HAL_DIR}")
            return {}

        for platform_dir in sorted(HAL_DIR.iterdir()):
            if not platform_dir.is_dir():
                continue

            hwrevs = sorted(
                d.name.replace('hwrev_', '')
                for d in platform_dir.iterdir()
                if d.is_dir() and d.name.startswith('hwrev_')
            )

            boards[platform_dir.name] = {
                "description": f"board: {platform_dir.name}",
                "hwrevs": hwrevs,
            }

        return boards
    
    def setup_ui(self):
        """Build the UI."""
        # Title
        title_frame = ttk.Frame(self.root)
        title_frame.pack(fill=tk.X, padx=10, pady=10)
        
        title_label = ttk.Label(title_frame, text="🔨 PDS Build System", font=("Arial", 18, "bold"))
        title_label.pack(side=tk.LEFT)
        
        subtitle_label = ttk.Label(title_frame, text="Select board → hardware → role → compile", font=("Arial", 10))
        subtitle_label.pack(side=tk.LEFT, padx=20)
        
        # Separator
        ttk.Separator(self.root, orient=tk.HORIZONTAL).pack(fill=tk.X, padx=10, pady=5)
        
        # Three columns frame
        columns_frame = ttk.Frame(self.root)
        columns_frame.pack(fill=tk.BOTH, expand=False, padx=10, pady=10)
        
        # board column
        self.platform_frame = ttk.LabelFrame(columns_frame, text="board", padding=10)
        self.platform_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        self.platform_var = tk.StringVar()
        self.platform_listbox = tk.Listbox(
            self.platform_frame, 
            height=10, 
            width=25,
            listvariable=self.platform_var,
            font=("Courier", 10),
            activestyle='dotbox',
            selectmode=tk.SINGLE,
            exportselection=False
        )
        self.platform_listbox.pack(fill=tk.BOTH, expand=True)
        self.platform_listbox.bind('<<ListboxSelect>>', self.on_platform_select)
        
        # Add boards to listbox
        for p_name in sorted(self.boards.keys()):
            self.platform_listbox.insert(tk.END, p_name)
        
        if self.platform_listbox.size() > 0:
            self.platform_listbox.selection_set(0)
        
        # Hardware Revision column
        self.hwrev_frame = ttk.LabelFrame(columns_frame, text="HARDWARE REVISION", padding=10)
        self.hwrev_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        self.hwrev_var = tk.StringVar()
        self.hwrev_listbox = tk.Listbox(
            self.hwrev_frame,
            height=10,
            width=20,
            listvariable=self.hwrev_var,
            font=("Courier", 10),
            activestyle='dotbox',
            selectmode=tk.SINGLE,
            exportselection=False
        )
        self.hwrev_listbox.pack(fill=tk.BOTH, expand=True)
        self.hwrev_listbox.bind('<<ListboxSelect>>', self.on_hwrev_select)
        
        # Role column
        self.role_frame = ttk.LabelFrame(columns_frame, text="DEVICE ROLE", padding=10)
        self.role_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        self.role_var = tk.StringVar()
        self.role_listbox = tk.Listbox(
            self.role_frame,
            height=10,
            width=25,
            listvariable=self.role_var,
            font=("Courier", 10),
            activestyle='dotbox',
            selectmode=tk.SINGLE,
            exportselection=False
        )
        self.role_listbox.pack(fill=tk.BOTH, expand=True)
        self.role_listbox.bind('<<ListboxSelect>>', self.on_role_select)
        
        # Command preview frame - CREATE BEFORE populate_hwrev_and_roles!
        cmd_frame = ttk.LabelFrame(self.root, text="COMMAND PREVIEW", padding=10)
        cmd_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.cmd_text = tk.Text(cmd_frame, height=3, font=("Courier", 9), bg="#f0f0f0", fg="#000000")
        self.cmd_text.pack(fill=tk.BOTH, expand=True)
        self.cmd_text.config(state=tk.DISABLED)
        
        # Populate hwrev and roles from first board
        self.populate_hwrev_and_roles()
        
        # Buttons frame
        buttons_frame = ttk.Frame(self.root)
        buttons_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.build_btn = ttk.Button(buttons_frame, text="🔨 COMPILE", command=self.start_build)
        self.build_btn.pack(side=tk.LEFT, padx=5)
        
        ttk.Button(buttons_frame, text="📋 List Boards", command=self.show_platforms).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="❌ Clear Output", command=self.clear_output).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="❓ Help", command=self.show_help).pack(side=tk.LEFT, padx=5)
        
        self.status_label = ttk.Label(buttons_frame, text="Ready", foreground="green")
        self.status_label.pack(side=tk.RIGHT, padx=10)
        
        # Separator
        ttk.Separator(self.root, orient=tk.HORIZONTAL).pack(fill=tk.X, padx=10, pady=5)
        
        # Output terminal
        output_label = ttk.Label(self.root, text="BUILD OUTPUT", font=("Arial", 10, "bold"))
        output_label.pack(fill=tk.X, padx=10, pady=(10, 5))
        
        self.output = scrolledtext.ScrolledText(
            self.root,
            height=15,
            font=("Courier", 9),
            bg="black",
            fg="#00ff00",
            insertbackground="white"
        )
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.output.config(state=tk.DISABLED)
        
        # Configure text tags for colors
        self.output.tag_configure("green", foreground="#00ff00")
        self.output.tag_configure("red", foreground="#ff0000")
        self.output.tag_configure("yellow", foreground="#ffff00")
    
    def populate_hwrev_and_roles(self):
        """Populate hwrev listbox based on selected board, then populate roles."""
        board_idx = self.platform_listbox.curselection()
        if not board_idx:
            return

        platform_name = self.platform_listbox.get(board_idx[0])
        board_info = self.boards.get(platform_name, {})

        # Clear and populate hwrev
        self.hwrev_listbox.delete(0, tk.END)
        hwrevs = board_info.get("hwrevs", [])
        for hwrev in hwrevs:
            self.hwrev_listbox.insert(tk.END, hwrev)

        if self.hwrev_listbox.size() > 0:
            self.hwrev_listbox.selection_set(0)
            self.hwrev_listbox.activate(0)

        # Populate roles for the now-selected hwrev
        self.populate_roles()

    def populate_roles(self):
        """Populate role listbox from the selected board + hwrev in the HAL directory."""
        board_idx = self.platform_listbox.curselection()
        hwrev_idx = self.hwrev_listbox.curselection()

        self.role_listbox.delete(0, tk.END)

        if not board_idx or not hwrev_idx:
            self.update_command_display()
            return

        platform_name = self.platform_listbox.get(board_idx[0])
        hwrev_id = self.hwrev_listbox.get(hwrev_idx[0])

        hwrev_dir = HAL_DIR / platform_name / f'hwrev_{hwrev_id}'
        roles = []
        if hwrev_dir.exists():
            roles = sorted(d.name for d in hwrev_dir.iterdir() if d.is_dir())

        for role in roles:
            self.role_listbox.insert(tk.END, role)

        if self.role_listbox.size() > 0:
            self.role_listbox.selection_set(0)
            self.role_listbox.activate(0)

        self.update_command_display()
    
    def on_platform_select(self, event=None):
        """Handle board selection."""
        self.populate_hwrev_and_roles()
        self.update_command_display()
    
    def on_hwrev_select(self, event=None):
        """Handle hardware revision selection — refresh roles for this hwrev."""
        self.populate_roles()
    
    def on_role_select(self, event=None):
        """Handle device role selection."""
        self.update_command_display()
    
    def update_command_display(self):
        """Update the command preview display."""
        # Get selections
        board_idx = self.platform_listbox.curselection()
        hwrev_idx = self.hwrev_listbox.curselection()
        role_idx = self.role_listbox.curselection()
        
        if board_idx and hwrev_idx and role_idx:
            board = self.platform_listbox.get(board_idx[0])
            hwrev = self.hwrev_listbox.get(hwrev_idx[0])
            role = self.role_listbox.get(role_idx[0])
            
            cmd = f"python build_selector.py --board {board} --hwrev {hwrev} --role {role}"
        else:
            cmd = "python build_selector.py --board <board> --hwrev <HWREV> --role <ROLE>"
        
        # Update text box
        self.cmd_text.config(state=tk.NORMAL)
        self.cmd_text.delete(1.0, tk.END)
        self.cmd_text.insert(1.0, cmd)
        self.cmd_text.config(state=tk.DISABLED)
    
    def log(self, message, color="green"):
        """Add message to output terminal."""
        self.output.config(state=tk.NORMAL)
        self.output.insert(tk.END, message + "\n", color)
        self.output.see(tk.END)
        self.output.config(state=tk.DISABLED)
    
    def clear_output(self):
        """Clear output terminal."""
        self.output.config(state=tk.NORMAL)
        self.output.delete(1.0, tk.END)
        self.output.config(state=tk.DISABLED)
    
    def start_build(self):
        """Start a build process."""
        if self.is_building:
            messagebox.showwarning("Warning", "Build already in progress!")
            return
        
        # Get selections
        board_idx = self.platform_listbox.curselection()
        hwrev_idx = self.hwrev_listbox.curselection()
        role_idx = self.role_listbox.curselection()
        
        if not board_idx or not hwrev_idx or not role_idx:
            messagebox.showerror("Error", "Please select board, hardware revision, and role!")
            return
        
        board = self.platform_listbox.get(board_idx[0])
        hwrev = self.hwrev_listbox.get(hwrev_idx[0])
        role = self.role_listbox.get(role_idx[0])
        
        # Clear output
        self.clear_output()
        
        # Log start
        self.log(f"[*] Starting build...", "green")
        self.log(f"[*] board: {board}", "green")
        self.log(f"[*] Hardware: {hwrev}", "green")
        self.log(f"[*] Role: {role}", "green")
        self.log(f"", "green")
        
        # Set status
        self.is_building = True
        self.status_label.config(text="🔨 Building...", foreground="orange")
        self.build_btn.config(state=tk.DISABLED)
        self.root.update()
        
        # Start build in thread
        thread = threading.Thread(
            target=self.build_worker,
            args=(board, hwrev, role),
            daemon=True
        )
        thread.start()
    
    def build_worker(self, board, hwrev, role):
        """Worker thread for build execution."""
        try:
            # Build command
            selector_script = SCRIPTS_DIR / "build_selector.py"
            
            if not selector_script.exists():
                self.output_queue.put((f"[-] Build selector not found: {selector_script}\n", "red"))
                self.is_building = False
                return
            
            cmd = [
                sys.executable,
                str(selector_script),
                "--board", board,
                "--hwrev", hwrev,
                "--role", role
            ]
            
            self.output_queue.put((f"[*] Running: {' '.join(cmd)}\n\n", "green"))
            
            # Run build with proper error handling
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(SCRIPT_DIR)
            )
            
            # Read output line by line
            try:
                for line in process.stdout:
                    if line:
                        self.output_queue.put((line.rstrip() + "\n", "green"))
            except:
                pass
            
            # Wait for process to finish
            return_code = process.wait()
            
            if return_code == 0:
                self.output_queue.put(("\n[+] Build completed successfully!\n", "green"))
            else:
                self.output_queue.put((f"\n[-] Build failed with exit code {return_code}\n", "red"))
        
        except Exception as e:
            import traceback
            self.output_queue.put((f"[-] Error: {e}\n", "red"))
            self.output_queue.put((f"{traceback.format_exc()}\n", "red"))
        
        finally:
            self.is_building = False
    
    def check_queue(self):
        """Check output queue and add to terminal."""
        while True:
            try:
                message, color = self.output_queue.get_nowait()
                self.log(message.rstrip(), color)
            except:
                break
        
        # Update status
        if self.is_building:
            self.status_label.config(text="🔨 Building...", foreground="orange")
            self.build_btn.config(state=tk.DISABLED)
        else:
            self.status_label.config(text="Ready", foreground="green")
            self.build_btn.config(state=tk.NORMAL)
        
        # Schedule next check
        self.root.after(100, self.check_queue)
    
    def show_platforms(self):
        """Show available boards."""
        info = "AVAILABLE boards\n" + "=" * 60 + "\n\n"
        
        for p_name, p_info in self.boards.items():
            info += f"{p_name}\n"
            info += f"  Description: {p_info.get('description', 'N/A')}\n"
            
            hwrevs = p_info.get('hwrevs', [])
            info += f"  Hardware: {', '.join(hwrevs)}\n"
            
            roles = p_info.get('available_roles', [])
            info += f"  Roles: {', '.join(roles)}\n\n"
        
        messagebox.showinfo("boards", info)
    
    def show_help(self):
        """Show help dialog."""
        help_text = """PDS BUILD SYSTEM - HELP

GETTING STARTED:
1. Select a board from the left column
2. Select a HARDWARE REVISION in the middle
3. Select a DEVICE ROLE on the right
4. Click COMPILE to start building

WHAT TO EXPECT:
- Build output appears in real-time in green text
- Errors appear in red text
- Build takes several minutes depending on board
- Last selection is remembered

BUTTONS:
- COMPILE: Start the build
- List Boards: Show all available boards
- Clear Output: Clear the terminal
- Help: Show this message

TROUBLESHOOTING:
- If build fails, check the output for error messages
- Ensure all tools are installed
- Check that hardware is connected (if needed)

For more info, see documentation in this directory."""
        
        messagebox.showinfo("Help", help_text)


def main():
    """Main entry point."""
    root = tk.Tk()
    app = BuildSystemGUI(root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
