export function companyLogoFor(companyName) {
    const normalisedName = companyName.toLowerCase();
    if (normalisedName.includes("axisforge") || normalisedName.includes("axisforce")) {
        return "./logos/axisforge_robotics_logo.svg";
    }
    if (normalisedName.includes("southern cell")) {
        return "./logos/southern_cell_automation_logo.svg";
    }
    if (normalisedName.includes("harbour motion") || normalisedName.includes("habour motion")) {
        return "./logos/harbour_motion_systems_logo.svg";
    }
    return undefined;
}
