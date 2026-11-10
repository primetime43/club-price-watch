using System.Diagnostics;
using System.Runtime.Versioning;
using System.Text.Json;
using Microsoft.Win32;

namespace ClubPriceWatch.Checker;

internal static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            var supported = new[] { "--dry-run", "--visible", "--browser-info", "--sign-in", "--setup-browser-extension" };
            if (args.Any(arg => !supported.Contains(arg, StringComparer.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Unsupported option. Dedicated profiles and local price-file checks have been retired. Use the normal browser extension.");
            using var mutex = new Mutex(true, @"Local\ClubPriceWatchWeeklyChecker", out var ownsMutex);
            if (!ownsMutex) throw new InvalidOperationException("Another launcher is running. Try again in a moment.");
            var browser = DefaultBrowser.Resolve();
            if (args.Contains("--browser-info", StringComparer.OrdinalIgnoreCase))
            {
                Console.WriteLine($"Windows default browser: {browser.Name}\nExecutable: {browser.Executable}\nNormal browser tabs and extensions; no checker profile.");
                return 0;
            }
            var config = LauncherConfig.Load(Path.Combine(AppContext.BaseDirectory, "launcher.json"));
            var signIn = args.Contains("--sign-in", StringComparer.OrdinalIgnoreCase);
            var target = signIn ? config.SignInUrl
                : args.Contains("--setup-browser-extension", StringComparer.OrdinalIgnoreCase) ? config.SetupUrl
                : args.Contains("--dry-run", StringComparer.OrdinalIgnoreCase) ? config.TestUrl : config.CheckUrl;
            using var launched = Process.Start(signIn
                ? new ProcessStartInfo(target) { UseShellExecute = true }
                : BrowserTabs.StartInfo(browser.Executable, target));
            if (launched is null) throw new InvalidOperationException("The browser tab could not be opened.");
            Console.WriteLine("Opened a normal browser tab. Check results are shown in the Club Price Watch extension; launching does not verify a price.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}

internal sealed record LauncherConfig(string CheckUrl, string TestUrl, string SignInUrl, string SetupUrl)
{
    public static LauncherConfig Load(string path)
    {
        if (!File.Exists(path)) throw new InvalidOperationException("launcher.json is missing. Run npm run build:extension from the source folder, then retry.");
        var config = JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        if (config is null || !Uri.TryCreate(config.CheckUrl, UriKind.Absolute, out var check) || check.Scheme != "chrome-extension" ||
            !Uri.TryCreate(config.TestUrl, UriKind.Absolute, out var test) || test.Scheme != check.Scheme || test.Host != check.Host ||
            !Uri.TryCreate(config.SignInUrl, UriKind.Absolute, out var signIn) || signIn.Scheme != "https" || signIn.Host != "www.bjs.com" ||
            !Uri.TryCreate(config.SetupUrl, UriKind.Absolute, out var setup) || setup.Scheme != "chrome" || setup.Host != "extensions")
            throw new InvalidOperationException("Invalid launcher configuration. Run npm run build:extension from the source folder, then retry.");
        return config;
    }
}

internal static class BrowserTabs
{
    public static ProcessStartInfo StartInfo(string executable, string url)
    {
        var info = new ProcessStartInfo { FileName = executable, UseShellExecute = false };
        info.ArgumentList.Add(url);
        return info;
    }
}

internal sealed record DefaultBrowser(string Executable, string Name)
{
    public static DefaultBrowser Resolve()
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("The Windows launcher requires Windows.");
        return ReadWindowsAssociation();
    }
    [SupportedOSPlatform("windows")]
    private static DefaultBrowser ReadWindowsAssociation()
    {
        using var choice = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice");
        var progId = choice?.GetValue("ProgId") as string;
        if (string.IsNullOrWhiteSpace(progId)) throw new InvalidOperationException("Choose a default HTTPS browser in Windows Settings and retry.");
        using var command = Registry.ClassesRoot.OpenSubKey(progId + @"\shell\open\command");
        return FromCommand(progId, command?.GetValue(null) as string, File.Exists);
    }
    internal static DefaultBrowser FromCommand(string progId, string? command, Func<string, bool> exists)
    {
        var text = command?.Trim() ?? "";
        var end = text.StartsWith('"') ? text.IndexOf('"', 1) : text.IndexOfAny([' ', '\t']);
        var path = text.StartsWith('"') ? (end > 1 ? text[1..end] : "") : (end >= 0 ? text[..end] : text);
        path = Environment.ExpandEnvironmentVariables(path);
        var app = progId.StartsWith("HeliumHTM", StringComparison.OrdinalIgnoreCase) ? ("Helium", "chrome.exe")
            : progId.StartsWith("ChromeHTML", StringComparison.OrdinalIgnoreCase) ? ("Chrome", "chrome.exe")
            : progId.StartsWith("BraveHTML", StringComparison.OrdinalIgnoreCase) ? ("Brave", "brave.exe")
            : progId.StartsWith("MSEdgeHTM", StringComparison.OrdinalIgnoreCase) ? ("Edge", "msedge.exe") : ("", "");
        if (app.Item1 == "") throw new InvalidOperationException("Set Helium, Chrome, Brave, or Edge as your default HTTPS browser to use the extension checker.");
        if (!Path.IsPathFullyQualified(path) || !Path.GetFileName(path).Equals(app.Item2, StringComparison.OrdinalIgnoreCase) || !exists(path))
            throw new InvalidOperationException("The default browser executable could not be found. Set your default browser again in Windows Settings.");
        return new(path, app.Item1);
    }
}
