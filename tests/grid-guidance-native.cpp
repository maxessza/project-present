#include "GridHeadingController.h"
#include "DriveController.h"
#include "config.h"
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

static std::vector<std::string> split(const std::string& line) {
    std::vector<std::string> fields;
    std::stringstream stream(line);
    std::string field;
    while (std::getline(stream, field, ',')) fields.push_back(field);
    return fields;
}

int main() {
    GridHeadingController grid;
    DriveController drive(MOTOR_PWM_LIMIT, MOTOR_MIN_PWM, MOTOR_PWM_SLEW_PER_SEC);
    std::string line;
    std::cout << "case,index,valid,request_left,request_right,rate,integral,steering,surge,applied_left,applied_right,stop_reason\n";
    while (std::getline(std::cin, line)) {
        if (line.empty() || line[0] == '#') continue;
        const auto f = split(line);
        if (f.size() != 20) return 2;
        const std::string name=f[0];
        const int index=std::stoi(f[1]);
        const float target=std::stof(f[2]), heading=std::stof(f[3]);
        const int base=std::stoi(f[4]);
        const uint32_t sampleUs=static_cast<uint32_t>(std::stoull(f[5]));
        const bool fresh=std::stoi(f[6])!=0;
        const int boatState=std::stoi(f[7]), safetyState=std::stoi(f[8]);
        const bool emergency=std::stoi(f[9])!=0, navAvailable=std::stoi(f[10])!=0;
        const bool hold=std::stoi(f[11])!=0;
        const float dt=std::stof(f[12]);
        if (std::stoi(f[13])) grid.reset();
        if (std::stoi(f[14])) drive.reset();
        DriveRequest request;
        if (std::stoi(f[15]) == 0) {
            request=grid.update(target,heading,base,sampleUs,fresh);
        } else {
            const int source=std::stoi(f[16]);
            const DriveSource driveSource=static_cast<DriveSource>(source);
            request={driveSource,std::stoi(f[17]),std::stoi(f[18]),std::stoi(f[19])!=0};
        }
        DriveInterlocks interlocks{};
        interlocks.state=static_cast<BoatState>(boatState);
        interlocks.safety=static_cast<SafetyState>(safetyState);
        interlocks.emergencyPending=emergency;
        interlocks.navigationAvailable=navAvailable;
        interlocks.waterSampleHold=hold;
        const DriveDecision out=drive.resolve(request,interlocks,dt);
        std::cout << name << ',' << index << ',' << (request.valid?1:0) << ','
                  << request.leftPwm << ',' << request.rightPwm << ','
                  << std::setprecision(9) << grid.headingRateDegPerSec() << ','
                  << grid.integralPwm() << ',' << grid.steeringPwm() << ',' << grid.surgePwm() << ','
                  << out.leftPwm << ',' << out.rightPwm << ',' << static_cast<int>(out.stopReason) << '\n';
    }
    return 0;
}
