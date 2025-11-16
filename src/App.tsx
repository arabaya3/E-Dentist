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

import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import { LIVE_CLIENT_OPTIONS } from "./config";
import AnalyticsOrchestrator from "./ai/dashboard/AnalyticsOrchestrator";
import SimpleVoiceConsole from "./components/simple-voice/SimpleVoiceConsole";
import VoiceAgentBootstrap from "./components/simple-voice/VoiceAgentBootstrap";

function App() {
  return (
    <LiveAPIProvider options={LIVE_CLIENT_OPTIONS}>
      <AnalyticsOrchestrator>
        <VoiceAgentBootstrap />
        <div className="App voice-app">
          <SimpleVoiceConsole />
        </div>
      </AnalyticsOrchestrator>
    </LiveAPIProvider>
  );
}

export default App;
