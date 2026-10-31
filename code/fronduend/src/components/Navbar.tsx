import {NavLink} from "react-router-dom";
import dashboardIcon from "../assets/images/caquelon-dashboard-icon.png";
import addIcon from "../assets/images/add-button-icon.png";
import leaveIcon from "../assets/images/leave-button-icon.png";
import {useEffect, useState} from "react";
import api from "../api/api.ts";

export default function Navbar() {

    const [hasFork, setHasFork] = useState<boolean>(false);

    useEffect(() => {
        api.getMyFork()
            .then(() => setHasFork(true))
            .catch(() => {
            })
    })

    return (
        <nav
            className="fixed inset-x-0 -bottom-px z-50 flex h-[78px] items-end justify-around border-t-2 border-border bg-bg pb-1.5 backdrop-blur-sm">
            <NavLink
                to="/"
                end
                aria-label="Dashboard"
                className={({isActive}) =>
                    `flex flex-col items-center justify-end rounded-xl px-4 transition-transform duration-200 hover:scale-105 active:scale-95 ${
                        isActive ? "scale-105 opacity-100 font-bold text-text-main" : "opacity-60 hover:opacity-90 font-medium text-text-muted"
                    }`
                }
            >
                <img
                    src={dashboardIcon}
                    alt="Dashboard"
                    className="-mb-1.5 h-16 w-16 object-contain"
                />
                <span className="text-xs leading-none">Dashboard</span>
            </NavLink>
            {hasFork ?
                <NavLink
                    to="/"
                    aria-label="Leave"
                    className={({isActive}) =>
                        `flex flex-col items-center justify-end rounded-xl px-4 transition-transform duration-200 hover:scale-105 active:scale-95 ${
                            isActive ? "scale-105 opacity-100 font-bold text-text-main" : "opacity-60 hover:opacity-90 font-medium text-text-muted"
                        }`
                    }
                    onClick={api.leavePot}
                >
                    <img
                        src={leaveIcon}
                        alt="Add Fork"
                        className="-mb-1.5 h-16 w-16 object-contain"
                    />
                    <span className="text-xs leading-none">Leave</span>
                </NavLink>
                :
                <NavLink
                    to="/new-fork"
                    aria-label="Add Fork"
                    className={({isActive}) =>
                        `flex flex-col items-center justify-end rounded-xl px-4 transition-transform duration-200 hover:scale-105 active:scale-95 ${
                            isActive ? "scale-105 opacity-100 font-bold text-text-main" : "opacity-60 hover:opacity-90 font-medium text-text-muted"
                        }`
                    }
                >
                    <img
                        src={addIcon}
                        alt="Add Fork"
                        className="-mb-1.5 h-16 w-16 object-contain"
                    />
                    <span className="text-xs leading-none">Add Fork</span>
                </NavLink>
            }
        </nav>
    );
}
