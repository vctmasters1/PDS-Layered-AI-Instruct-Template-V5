import os  
base = '.'  
content = open("k:/PDS-Master-001/.ai/conventions.md", "r").read()  
with open(base + "/conventions.md", "w") as f: f.write(content) 
