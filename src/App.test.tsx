/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./config", () => ({
  LIVE_CLIENT_OPTIONS: { apiKey: "test-key", httpOptions: {} },
}));

jest.mock("./ai/dashboard/AnalyticsOrchestrator", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockClient = {
  on: jest.fn().mockReturnThis(),
  off: jest.fn().mockReturnThis(),
  sendRealtimeInput: jest.fn(),
  sendToolResponse: jest.fn(),
};

const mockContextValue = {
  client: mockClient,
  setConfig: jest.fn(),
  config: {},
  model: "models/test",
  setModel: jest.fn(),
  connected: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  volume: 0,
};

jest.mock("./contexts/LiveAPIContext", () => {
  const React = require("react");
  const Context = React.createContext(null);
  return {
    LiveAPIProvider: ({ children }: { children: ReactNode }) => (
      <Context.Provider value={mockContextValue}>{children}</Context.Provider>
    ),
    useLiveAPIContext: () => React.useContext(Context),
  };
});

jest.mock("./lib/audio-recorder", () => {
  class StubRecorder {
    on() {
      return this;
    }

    off() {
      return this;
    }

    start() {
      return Promise.resolve();
    }

    stop() {
      return;
    }
  }

  return { AudioRecorder: StubRecorder };
});

test("renders the voice assistant interface", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /edentist\.ai/i })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
});
