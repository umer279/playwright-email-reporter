import { createTransport } from "nodemailer";
import AnsiToHtml from "ansi-to-html";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type ReporterOptions = {
  reportName?: string;
  reportDesc?: string;
  reportLink?: string;
  link?: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpSecure: boolean | string;
  smtpUser: string;
  smtpPass: string;
  from: string;
  to: string;
  mailOnSuccess?: boolean | string;
};

type FailedTest = {
  name: string;
  status: string;
  duration: number;
  error: string;
  project: string;
};

type ReporterSummary = {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  failedTests: FailedTest[];
  startTime: Date | null;
  endTime: Date | null;
};

const ansiToHtml = new AnsiToHtml();

const toBoolean = (value: boolean | string | undefined): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true";
};

class EmailReporter implements Reporter {
  private readonly options: ReporterOptions;
  private readonly results: ReporterSummary;
  private readonly reportLink: string | null;
  private readonly mailOnSuccess: boolean;
  private readonly reportName: string;
  private readonly reportDesc: string;
  private suite: Suite | null = null;

  constructor(options: ReporterOptions) {
    this.options = options;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      failedTests: [],
      startTime: null,
      endTime: null,
    };
    // `link` kept for backward compatibility.
    this.reportLink = options.reportLink ?? options.link ?? null;
    this.mailOnSuccess = toBoolean(options.mailOnSuccess);
    this.reportName = options.reportName ?? "Playwright Test Report";
    this.reportDesc = options.reportDesc ?? "";
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.results.startTime = new Date();
    this.suite = suite;
  }

  onStdOut(chunk: string | Buffer): void {
    process.stdout.write(chunk.toString("utf-8"));
  }

  onStdErr(chunk: string | Buffer): void {
    process.stderr.write(chunk.toString("utf-8"));
  }

  async onEnd(_result: FullResult): Promise<void> {
    const tests = this.suite?.allTests() ?? [];

    for (const test of tests) {
      this.collectTestResult(test);
    }

    this.results.endTime = new Date();
    const startTime = this.results.startTime ?? this.results.endTime;
    const durationInMs = this.results.endTime.getTime() - startTime.getTime();
    const duration = this.formatDuration(durationInMs);

    if (this.mailOnSuccess || this.results.failed > 0) {
      const htmlContent = this.generateHtmlReport(duration);
      await this.sendEmail(htmlContent);
    }
  }

  private collectTestResult(test: TestCase): void {
    this.results.total++;
    const testResults = test.results ?? [];
    const lastResult = testResults.at(-1);

    if (!lastResult) {
      this.results.skipped++;
      return;
    }

    if (lastResult.status === "passed" && lastResult.retry > 0) {
      this.results.flaky++;
      return;
    }

    if (lastResult.status === "passed") {
      this.results.passed++;
      return;
    }

    if (lastResult.status === "skipped") {
      this.results.skipped++;
      return;
    }

    this.results.failed++;
    this.results.failedTests.push(this.toFailedTest(test, lastResult));
  }

  private toFailedTest(test: TestCase, testResult: TestResult): FailedTest {
    const specFileName = test.location.file.split("/").pop() ?? "unknown-file";
    const describePart = test.parent.title || "unknown-suite";
    const projectName = test.titlePath().at(1) ?? "unknown";
    const errorMessage =
      testResult.error?.message ??
      testResult.errors?.[0]?.message ??
      "No error message";

    return {
      name: `${test.title} < ${describePart} < ${specFileName}`,
      status: testResult.status,
      duration: testResult.duration,
      error: ansiToHtml.toHtml(errorMessage),
      project: projectName,
    };
  }

  private formatDuration(durationInMs: number): string {
    const hours = Math.floor(durationInMs / 3600000);
    const minutes = Math.floor((durationInMs % 3600000) / 60000);
    const seconds = Math.floor((durationInMs % 60000) / 1000);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.length > 0 ? parts.join(" ") : `${durationInMs} ms`;
  }

  private generateHtmlReport(duration: string): string {
    const { total, passed, failed, flaky, skipped, failedTests } = this.results;
    const reportLink = this.reportLink
      ? `The full report can be found at <a href="${this.reportLink}">${this.reportLink}</a>.`
      : "";

    const failedTestsRows = failedTests
      .map(
        (test) => `
          <tr>
            <td style="background-color: #1a1a2e; color: #f8f9fa;">${test.name}</td>
            <td style="background-color: #1a1a2e; color: #f8f9fa;">${test.project}</td>
            <td style="background-color: #1a1a2e; color: #f8f9fa;">${this.formatDuration(test.duration)}</td>
            <td style="background-color: #1a1a2e; color: #f8f9fa;">${test.error}</td>
          </tr>
        `
      )
      .join("");

    return `
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          h3 {
            color: #343a40;
          }
          h3 a {
            text-decoration: none;
            color: #0056b3;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 20px;
          }
          thead tr {
            background-color: #f8f9fa;
            text-align: left;
            border-bottom: 2px solid #dee2e6;
          }
          th, td {
            padding: 10px;
            border: 1px solid #dee2e6;
          }
          tbody td {
            text-align: left;
          }
          td.passed {
            color: #28a745;
          }
          td.failed {
            color: #dc3545;
          }
          td.flaky {
            color: #ffc107;
          }
          h2 {
            color: #343a40;
            margin-top: 20px;
          }
          .no-failed-tests {
            text-align: center;
          }
          h1 {
            color: #343a40;
          }
          h4 {
            color: #343a40;
          }
        </style>
      </head>
      <body>
        <h1>${this.reportName}</h1>
        <h4>${this.reportDesc}</h4>
        <h3>${reportLink}</h3>

        <table border="1" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th>Total Tests</th>
              <th>Passed ✅</th>
              <th>Failed ❌</th>
              <th>Flaky ⚠️</th>
              <th>Skipped</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${total}</td>
              <td class="passed">${passed}</td>
              <td class="failed">${failed}</td>
              <td class="flaky">${flaky}</td>
              <td>${skipped}</td>
              <td>${duration}</td>
            </tr>
          </tbody>
        </table>

        <h2>Failed Tests</h2>
        <table border="1" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th>Test</th>
              <th>Project</th>
              <th>Duration</th>
              <th>Error Message</th>
            </tr>
          </thead>
          <tbody>
            ${failedTestsRows || "<tr><td colspan='4' class='no-failed-tests'>No failed tests</td></tr>"}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  private async sendEmail(htmlContent: string): Promise<void> {
    const transporter = createTransport({
      host: this.options.smtpHost,
      port: Number(this.options.smtpPort),
      secure: toBoolean(this.options.smtpSecure),
      auth: {
        user: this.options.smtpUser,
        pass: this.options.smtpPass,
      },
    });

    await transporter.sendMail({
      from: this.options.from,
      to: this.options.to,
      subject: this.reportName,
      html: htmlContent,
    });

    console.log("Email sent successfully.");
  }
}

export = EmailReporter;
