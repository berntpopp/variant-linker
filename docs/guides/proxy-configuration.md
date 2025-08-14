# Proxy Configuration Guide

Learn how to configure HTTP/HTTPS proxy settings for variant-linker in corporate environments or networks with proxy requirements.

## CLI Parameters (Recommended)

The most straightforward approach is using CLI parameters:

```bash
# Basic proxy
variant-linker --variant "rs123" --proxy http://proxy.company.com:8080 --output JSON

# Authenticated proxy (embedded credentials)
variant-linker --variant "rs123" --proxy http://user:pass@proxy.company.com:8080 --output JSON

# Authenticated proxy (separate parameter)
variant-linker --variant "rs123" --proxy http://proxy.company.com:8080 --proxy-auth user:pass --output JSON

# HTTPS proxy
variant-linker --variant "rs123" --proxy https://proxy.company.com:8443 --output JSON
```

## Environment Variables

For persistent proxy configuration, set environment variables that variant-linker (via axios) will automatically use.

### Linux/macOS

#### Temporary (current session only)
```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1

# Run variant-linker (proxy automatically used)
variant-linker --variant "rs123" --output JSON
```

#### Permanent (all sessions)
Add to your shell profile (`.bashrc`, `.zshrc`, or `.profile`):

```bash
# Edit your shell profile
nano ~/.bashrc  # or ~/.zshrc for zsh

# Add these lines
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1

# Reload profile
source ~/.bashrc
```

#### System-wide (all users)
```bash
# Edit system environment
sudo nano /etc/environment

# Add these lines
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080
NO_PROXY=localhost,127.0.0.1

# Reboot or re-login for changes to take effect
```

### Windows

#### Temporary (current PowerShell session)
```powershell
$env:HTTP_PROXY="http://proxy.company.com:8080"
$env:HTTPS_PROXY="http://proxy.company.com:8080"
$env:NO_PROXY="localhost,127.0.0.1"

# Run variant-linker (proxy automatically used)
variant-linker --variant "rs123" --output JSON
```

#### Permanent (current user)
```powershell
[Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://proxy.company.com:8080", "User")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxy.company.com:8080", "User")
[Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1", "User")

# Restart PowerShell for changes to take effect
```

#### Permanent (all users - requires admin)
```powershell
[Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://proxy.company.com:8080", "Machine")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxy.company.com:8080", "Machine")
[Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1", "Machine")

# Restart PowerShell for changes to take effect
```

#### Alternative - System Properties GUI
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Go to **Advanced** tab → **Environment Variables**
3. Add variables under **User variables** (current user) or **System variables** (all users):
   - Variable name: `HTTP_PROXY`, Value: `http://proxy.company.com:8080`
   - Variable name: `HTTPS_PROXY`, Value: `http://proxy.company.com:8080`
   - Variable name: `NO_PROXY`, Value: `localhost,127.0.0.1`
4. Click OK and restart PowerShell

## Verification

### Check Environment Variables

**Linux/macOS:**
```bash
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

**Windows:**
```powershell
[Environment]::GetEnvironmentVariable("HTTP_PROXY", "User")
[Environment]::GetEnvironmentVariable("HTTPS_PROXY", "User")
```

### Test Proxy Connection

```bash
# Test with a simple variant
variant-linker --variant "rs123" --output JSON -d

# The debug output will show if proxy is being used
```

## Priority Order

When multiple proxy configurations are present, variant-linker uses this priority:

1. **CLI parameters** (`--proxy`, `--proxy-auth`) - highest priority
2. **Environment variables** (`HTTP_PROXY`, `HTTPS_PROXY`)
3. **No proxy** - direct connection

## Common Proxy Formats

### Basic HTTP Proxy
```bash
--proxy http://proxy.example.com:8080
```

### HTTPS Proxy
```bash
--proxy https://proxy.example.com:8443
```

### Authenticated Proxy
```bash
--proxy http://username:password@proxy.example.com:8080
```

### Corporate Domain Authentication
```bash
--proxy http://domain\\username:password@proxy.example.com:8080
```

## Troubleshooting

### Connection Issues

**Problem:** `ECONNRESET` or `ETIMEDOUT` errors
**Solution:** 
- Verify proxy URL and port
- Check authentication credentials
- Test proxy connectivity with curl/wget

**Problem:** Authentication failures
**Solution:**
- Use `--proxy-auth` parameter for special characters in passwords
- URL-encode special characters in proxy URL
- Try domain\\username format for Windows domains

### Debug Proxy Usage

Enable debug output to see proxy configuration:

```bash
variant-linker --variant "rs123" --proxy http://proxy:8080 --output JSON -d
```

Look for proxy-related messages in the debug output.

### Testing Proxy Configuration

```bash
# Test environment variables
curl --proxy $HTTP_PROXY https://rest.ensembl.org

# Test CLI proxy parameter  
variant-linker --variant "rs123" --proxy http://proxy:8080 --output JSON -d
```

## Security Considerations

- **Avoid embedding credentials** in command history or scripts
- **Use separate authentication** parameter when possible:
  ```bash
  --proxy http://proxy:8080 --proxy-auth username:password
  ```
- **Set environment variables** in secure locations
- **Use HTTPS proxies** when available for encrypted proxy communication

This guide covers the most common proxy configuration scenarios for variant-linker in corporate and restricted network environments.