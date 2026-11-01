import {Route, Routes} from "react-router-dom";
import Index from "./pages/Index.tsx";
import NewFork from "./pages/NewFork.tsx";
import Navbar from "./components/Navbar.tsx";

export function App() {
    return (
        <div className="min-h-screen pb-[88px]">
            <Routes>
                <Route path={`/`} element={<Index/>}/>
                <Route path={"/new-fork"} element={<NewFork/>}/>
            </Routes>
            <Navbar/>
        </div>
    );
}
