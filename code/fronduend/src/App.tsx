import {Route, Routes} from "react-router-dom";
import Index from "./pages/Index.tsx";
import NewFork from "./pages/NewFork.tsx";

export function App() {
    return <Routes>
        <Route path={`/`} element={<Index/>}/>
        <Route path={"/new-fork"} element={<NewFork/>}/>
    </Routes>
}
