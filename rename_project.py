import os
import re

def rename_in_files(root_dir, search_text, replace_text, case_insensitive=True):
    for root, dirs, files in os.walk(root_dir):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
        
        for file in files:
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if case_insensitive:
                    new_content = re.sub(re.escape(search_text), replace_text, content, flags=re.IGNORECASE)
                else:
                    new_content = content.replace(search_text, replace_text)
                
                if new_content != content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated: {file_path}")
            except Exception as e:
                print(f"Skipped {file_path}: {e}")

# Renaming patterns
root = r"c:\Users\Hopef\Desktop\Fgsh"

# 1. Package scope
rename_in_files(root, "@fakash/", "@fgsh/", case_insensitive=True)

# 2. Project name in strings
rename_in_files(root, "Fakash", "Fgsh", case_insensitive=False)
rename_in_files(root, "fakash", "fgsh", case_insensitive=False)

# 3. Arabic variants (if they appear as typos)
rename_in_files(root, "ففش", "فقش", case_insensitive=False) # Fixing the typo found in game.ts
