const ALLOWED_TOOLS = [
  "nmap", "nuclei", "nikto", "sqlmap", "hydra", "metasploit",
  "ffuf", "gobuster", "dirb", "wpscan", "joomscan",
  "enum4linux", "smbclient", "smbmap", "ldapsearch",
  "dig", "nslookup", "host", "whois", "dnsrecon", "dnsenum",
  "curl", "wget", "nc", "netcat", "socat",
  "openssl", "ssh", "scp", "rsync",
  "python3", "python", "perl", "ruby", "php", "node",
  "bash", "sh", "zsh", "cat", "less", "more", "head", "tail",
  "grep", "awk", "sed", "cut", "sort", "uniq", "wc", "tee",
  "ls", "cd", "pwd", "cp", "mv", "rm", "mkdir", "touch", "chmod", "chown",
  "find", "locate", "which", "whereis", "file", "stat", "du", "df",
  "ps", "top", "htop", "kill", "killall", "pkill", "pgrep",
  "ifconfig", "ip", "route", "traceroute", "ping", "ss", "netstat",
  "tcpdump", "tshark", "wireshark",
  "git", "docker", "docker-compose",
  "echo", "printf", "env", "export", "source", "alias", "type",
  "date", "cal", "sleep", "time", "watch",
  "clear", "reset", "history", "id", "uname", "hostname",
  "tar", "gzip", "gunzip", "zip", "unzip", "bzip2", "xz",
  "apt", "apt-get", "dpkg", "snap", "pip", "pip3", "gem", "npm",
  "nologin",
]

export function validateCommand(command: string): { valid: boolean; command: string; error?: string } {
  const trimmed = command.trim()
  if (!trimmed) return { valid: false, command: "", error: "Empty command" }

  if (trimmed.includes('`') || trimmed.includes('$(')) {
    return { valid: false, command: trimmed, error: "Command substitution is not allowed" }
  }

  const segments = trimmed.split(/[|;&]+/)
  for (const segment of segments) {
    const segmentTrimmed = segment.trim()
    if (!segmentTrimmed) continue
    
    const firstToken = segmentTrimmed.split(/\s+/)[0].toLowerCase()
    if (!ALLOWED_TOOLS.includes(firstToken)) {
      return { valid: false, command: trimmed, error: `Tool not allowed: ${firstToken}` }
    }

    if (['bash', 'sh', 'zsh', 'python', 'python3', 'perl', 'ruby', 'php', 'node'].includes(firstToken)) {
      if (/\s-[ce]\b/.test(segmentTrimmed)) {
         return { valid: false, command: trimmed, error: `Code execution flags are not allowed for ${firstToken}` }
      }
    }
  }

  // Block commands that try to reach internal networks
  const blockedPatterns = [
    /127\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
    /0x7f\.0\.0\.1/i,
    /0177\.0\.0\.1/i,
    /2130706433/,
    /localhost/i,
    /10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
    /172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/,
    /192\.168\.\d{1,3}\.\d{1,3}/,
    /169\.254\.\d{1,3}\.\d{1,3}/,
    /metadata\.google\.internal/i,
    /169\.254\.169\.254/,
  ]
  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        command: trimmed,
        error: "Command targets internal/private IP ranges which are blocked for security.",
      }
    }
  }

  return { valid: true, command: trimmed }
}
