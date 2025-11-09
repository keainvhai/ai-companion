import { BrowserRouter, Routes, Route } from "react-router-dom";
import ChatPage from "./ChatPage";
import IntentTestPage from "./IntentTestPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 默认主页：Chat 页面 */}
        <Route path="/" element={<ChatPage />} />

        {/* 测试页：意图与感知分析 */}
        <Route path="/test-intent" element={<IntentTestPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
