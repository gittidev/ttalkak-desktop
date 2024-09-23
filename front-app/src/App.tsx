import "./App.css";
import { Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import DashBoard from "./pages/DashBoard";
import Port from "./pages/Port";
import Header from "./components/Header";
import SignUp from "./pages/SignUp";
import SideNavBar from "./components/SideNavBar";
import Footer from "./components/Footer";
import OverlayPanel from "./components/OverlayPanel";
import { useAuthStore } from "./stores/authStore";

function App() {
  const isLoggedIn = useAuthStore((state) => state.accessToken);
  const location = useLocation();
  const isSignupPage = location.pathname === "/signup";

  return (
    <div className="bg-color-1 h-screen flex flex-col">
      <Header />
      <div className="flex overflow-hidden">
        <SideNavBar />
        <div
          className="flex-grow overflow-auto custom-scrollbar ml-64 px-6 py-6  relative"
          style={{ height: "calc(100vh - 40.8px - 24px)" }}
        >
          {!isLoggedIn && !isSignupPage && <OverlayPanel />}

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<DashBoard />} />
            <Route path="/port" element={<Port />} />
            <Route path="/signup" element={<SignUp />} />
          </Routes>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default App;
