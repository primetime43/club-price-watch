using ClubPriceWatch.Checker;
using System.Text.Json;

internal static class CheckerTests
{
    public static void Main()
    {
        void Check(bool value, string message)
        {
            if (!value) throw new Exception(message);
            Console.WriteLine("PASS " + message);
        }
        var launch = BrowserTabs.StartInfo("browser.exe", "chrome-extension://extension/runner.html?mode=test");
        Check(launch.ArgumentList.Count == 1 && launch.ArgumentList[0].EndsWith("mode=test"), "only the target URL is passed to the normal browser");
        Check(!launch.UseShellExecute && launch.WindowStyle == System.Diagnostics.ProcessWindowStyle.Normal, "no private profile, headless flag, or hidden browser window");
        var exe = Path.Combine(Path.GetTempPath(), "Helium", "chrome.exe");
        Check(DefaultBrowser.FromCommand("HeliumHTM.123", $"\"{exe}\" --single-argument %1", path => path == exe).Executable == exe, "default browser command arguments are not executed");
        foreach (var (id, filename, label) in new[] { ("ChromeHTML", "chrome.exe", "Chrome"), ("BraveHTML.123", "brave.exe", "Brave"), ("MSEdgeHTM", "msedge.exe", "Edge") })
            Check(DefaultBrowser.FromCommand(id, $"\"{Path.Combine(Path.GetTempPath(), filename)}\" %1", _ => true).Name == label, "recognizes " + label);
        foreach (var (id, command, exists) in new[] { ("FirefoxURL", $"\"{exe}\"", true), ("ChromeHTML", "chrome.exe %1", true), ("ChromeHTML", "\"unterminated", true), ("ChromeHTML", $"\"{exe}\"", false) })
        {
            try { DefaultBrowser.FromCommand(id, command, _ => exists); throw new Exception("Invalid association accepted"); }
            catch (InvalidOperationException) { Check(true, "invalid or unsupported associations fail explicitly"); }
        }
        var configPath = Path.Combine(Path.GetTempPath(), "cpw-launcher-test-" + Guid.NewGuid().ToString("N") + ".json");
        try
        {
            var config = new LauncherConfig("chrome-extension://test/runner.html?mode=check", "chrome-extension://test/runner.html?mode=test", "https://www.bjs.com/", "chrome://extensions/");
            File.WriteAllText(configPath, JsonSerializer.Serialize(config));
            Check(LauncherConfig.Load(configPath).CheckUrl == config.CheckUrl, "launcher reads generated configuration without business constants");
            File.WriteAllText(configPath, "{}");
            try { LauncherConfig.Load(configPath); throw new Exception("Invalid config accepted"); }
            catch (InvalidOperationException) { Check(true, "invalid generated configuration fails before browser launch"); }
        }
        finally { if (File.Exists(configPath)) File.Delete(configPath); }
    }
}
