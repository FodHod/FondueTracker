import { NavLink } from "react-router-dom";
import dashboardIcon from "../assets/images/caquelon-dashboard-icon.png";
import addIcon from "../assets/images/add-button-icon.png";

export default function Navbar() {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[84px] items-center justify-around border-t-2 border-border bg-bg/95 backdrop-blur-sm">
            <NavLink
                to="/"
                end
                aria-label="Dashboard"
                className={({ isActive }) =>
                    `flex flex-col items-center justify-center rounded-xl px-4 transition-transform duration-200 hover:scale-105 active:scale-95 ${
                        isActive ? "scale-105 opacity-100 font-bold text-text-main" : "opacity-60 hover:opacity-90 font-medium text-text-muted"
                    }`
                }
            >
                <img
                    src={dashboardIcon}
                    alt="Dashboard"
                    className="-my-1.5 h-16 w-16 object-contain"
                />
                <span className="text-xs leading-tight">Dashboard</span>
            </NavLink>

            <NavLink
                to="/new-fork"
                aria-label="Add Fork"
                className={({ isActive }) =>
                    `flex flex-col items-center justify-center rounded-xl px-4 transition-transform duration-200 hover:scale-105 active:scale-95 ${
                        isActive ? "scale-105 opacity-100 font-bold text-text-main" : "opacity-60 hover:opacity-90 font-medium text-text-muted"
                    }`
                }
            >
                <img
                    src={addIcon}
                    alt="Add Fork"
                    className="-my-1.5 h-16 w-16 object-contain"
                />
                <span className="text-xs leading-tight">Add Fork</span>
            </NavLink>
        </nav>
    );
}
