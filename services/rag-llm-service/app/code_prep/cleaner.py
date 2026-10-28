import re


def remove_comments(source: str) -> str:
    """Remove Solidity comments while preserving line numbers.

    - Single-line comments (// ...) are replaced with blank lines.
    - Multi-line comments (/* ... */) are replaced with blank lines (one per original line).
    Line numbers must stay intact because hypothesis locations reference them.
    """
    result = []
    i = 0
    lines = source.splitlines(keepends=True)
    
    text = source
    output = []
    pos = 0
    length = len(text)

    while pos < length:
       
        if text[pos:pos+2] == "//":
            
            end = text.find("\n", pos)
            if end == -1:
                
                pos = length
            else:
                output.append("\n")  
                pos = end + 1
            continue

        
        if text[pos:pos+2] == "/*":
            end = text.find("*/", pos + 2)
            if end == -1:
                pos = length  
                continue
            comment_block = text[pos:end+2]
            
            newline_count = comment_block.count("\n")
            output.append("\n" * newline_count)
            pos = end + 2
            continue

        
        if text[pos] in ('"', "'"):
            quote_char = text[pos]
            output.append(text[pos])
            pos += 1
            while pos < length:
                ch = text[pos]
                output.append(ch)
                pos += 1
                if ch == "\\" and pos < length:
                    output.append(text[pos])
                    pos += 1
                elif ch == quote_char:
                    break
            continue

        output.append(text[pos])
        pos += 1

    return "".join(output)


def add_line_numbers(source: str) -> str:
    """Prefix each line with its 1-based line number for LLM context."""
    lines = source.splitlines()
    return "\n".join(f"{i+1:4d} | {line}" for i, line in enumerate(lines))
