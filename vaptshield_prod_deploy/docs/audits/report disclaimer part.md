Disclaimer 
All information contained in this document is confidential and proprietary to SDET Tech and SAAL. Disclosure or use of any information contained in this document by photographic, electronic or any other means, in whole or in part, for any reason other than for operations / network security enhancement of the internal review is strictly prohibited without written consent.  
SDET Tech shall assume no liability for any changes, omissions, or errors in this document. All the recommendations are provided on an ‘as is’ basis and are void of any warranty expressed or implied. SDET Tech shall not be liable for any damage, financial or otherwise, arising out of use/misuse of this report by any current employee of SAAL or any member of the general public. 
This report strictly outlines the known vulnerabilities present in the target web application(s)/URLs as mentioned in the report.  Any changes in the code base or the environment, which can include Host provider, database, network configuration, firewalls, IDS/IPS, etc., may result in vulnerabilities apart from the ones already listed in the report. Such a case shall require a thorough round of Vulnerability assessment and Penetration testing before deploying the application into production.   
Other applications residing on the same server, if any, were not targeted in any manner during the process. It is also noteworthy that this report doesn’t take into account any zero-day vulnerabilities. SDET Tech shall assume no liability in case of a zero-day attack



Disclaimer 

 

Confidentiality & Disclaimer Notice 

All information contained within this document is strictly confidential and proprietary to SDET Technologies and Spektra Systems. This report pertains exclusively to the security assessment conducted against the C3 Portal deployed in the kpnsandbox environment, accessible at https://kpnsandbox.cspcontrolcenter.net, and is intended solely for internal security review and remediation purposes by authorized personnel. 

Any unauthorized disclosure, reproduction, distribution, or use of this document — in whole or in part — through electronic, photographic, mechanical, or any other means is strictly prohibited without prior written consent from SDET Tech. 

Scope of Assessment & Testing Conclusion 

This penetration test was formally concluded against the agreed-upon build and environment defined at the outset of the engagement. All testing activities were carried out under a structured, controlled methodology during the designated assessment window. The security findings and observations documented herein reflect the posture of the C3 Portal (kpnsandbox environment) as it existed at the precise time of testing, and apply strictly within the boundaries of the mutually agreed scope of engagement. 

No vulnerabilities were identified within the defined scope during the course of this assessment. This conclusion is valid exclusively for the tested build, configuration, and environment as assessed during the engagement period. 

SDET Tech assumes no responsibility for any vulnerabilities, exposures, or security gaps identified by any other vendor, third-party assessor, or internal team — whether before, during, or after this engagement. Findings reported by other parties fall outside the purview of this assessment and cannot be attributed to or associated with the conclusions of this report. 

Limitations & Exclusions 

The following exclusions and limitations apply to this engagement and must be acknowledged by all parties reviewing this report: 

    Post-Assessment Changes: SDET Tech bears no responsibility for any vulnerabilities arising from changes, patches, deployments, configuration updates, code modifications, or environmental alterations made following the completion of testing. The security posture of the application may change as the environment evolves beyond the tested state. 

    Out-of-Scope Systems: Applications, services, APIs, or infrastructure components residing on the same server or broader ecosystem but outside the defined scope of engagement were neither assessed nor covered under this report. No assumptions should be made regarding the security of out-of-scope components based on the conclusions herein. 

    Payment Processing Components: The scope of this assessment explicitly excluded all payment processing functionality, payment gateways, third-party financial integrations, and transaction processing modules. Any such components, if present in the broader ecosystem, were not tested and are not addressed in this report. 

    Zero-Day Vulnerabilities: This assessment does not account for zero-day vulnerabilities or newly emerging threats identified after the conclusion of testing. SDET Tech shall bear no liability in the event of a zero-day attack or any exploit leveraging previously unknown vulnerabilities. 

 

General Disclaimer 

All recommendations and observations provided in this report are offered on an "as is" basis, without warranty of any kind, whether expressed or implied. SDET Tech shall not be held liable for any direct, indirect, incidental, consequential, financial, operational, or reputational damages arising from the use, misuse, or misinterpretation of this report by any employee, contractor, or third party. 




Executive Summary 

 

SDET Tech was engaged to conduct a comprehensive Vulnerability Assessment and Penetration Testing (VAPT) exercise against the KPN Sandbox CSP Control Center web application, hosted at https://kpnsandbox.cspcontrolcenter.net. Following the delivery of the initial assessment report, a structured revalidation exercise was subsequently performed to verify the effectiveness of remediation measures implemented by the development team against the build submitted for retesting. 

Initial Assessment 

The original assessment was conducted using a Gray-box testing methodology, aligned with the OWASP Top 10 (2025) framework, covering authentication mechanisms, authorization controls, API security, business logic enforcement, session management, and secure configuration. The assessment was carried out from 05 February 2026 to 12 February 2026. As formally agreed, upon and documented in the Round 1 report, all payment processing functionality and external payment gateway integrations remained explicitly out of scope throughout the engagement. 

During the initial assessment, multiple vulnerabilities ranging from Critical to Informational severity were identified. Systemic weaknesses in Broken Access Control and business logic enforcement represented the most significant risk areas observed at that time. 

Revalidation & Remediation Outcome 

Upon completion of the revalidation exercise conducted against the build submitted for retesting, all previously reported findings were confirmed to have been successfully remediated. The corrective actions implemented by the development team were observed to have substantially strengthened the following areas: 

    Role-based access control enforcement 

    Server-side authorization validation 

    API security controls 

    Input validation mechanisms 

    Overall security governance across the platform 

The previously reported finding pertaining to "Unauthorized Access to Hidden Administrative Endpoints" was also confirmed as remediated during retesting, with no further bypass observed under the testing conditions applied. 

It is important to note that this revalidation was performed exclusively against the build provided for retesting within the agreed scope of engagement. SDET Tech's conclusions are confined to the state of the application as assessed during the defined retesting window and cannot be extended to any subsequent changes, deployments, or configurations made thereafter. 

Overall Posture & Recommendations 

The overall security posture of the C3 Portal was found to have improved substantially compared to the baseline established during the initial assessment. All Critical and High-severity risks were confirmed as effectively mitigated, and no exploitable vulnerabilities remained within the agreed scope of testing at the time of report closure. 

SDET Tech recommends that Spektra Systems maintain centralized and globally enforced authorization controls, consistent server-side validation mechanisms, and a regular cadence of periodic security assessments to ensure continued resilience against evolving threats. Security posture should be reassessed following any significant changes to the application architecture, codebase, or hosting environment.




Executive Summary 

 

SDET Tech was contacted by SAAL to conduct the Vulnerability Assessment and Penetration Testing (VAPT) to evaluate the security posture of the E2 web application hosted at https://secops-e2.saal.ai/. The objective of this assessment was to assess how well the E2 web application can withstand real-world attacks under a gray box model.  

 

The engagement was conducted using a Gray-box penetration testing approach to simulate real-world attack scenarios and assess the security posture of the web application. The assessment simulated web attack scenarios with prior remote access into SAAL network focusing on identifying and exploiting web vulnerabilities. The testing approach was aligned with the OWASP Top 10 framework and industry best practices, ensuring that findings are relevant to both technical and business risk management. 

 

The security assessment of the secops-e2.saal.ai application and its supporting infrastructure has revealed several serious vulnerabilities that significantly impact the confidentiality, integrity, and availability of the system. 

 

Through systematic reconnaissance, vulnerability assessment, and controlled exploitation, SDET Tech identified a total of 25 security vulnerabilities, ranging from risk severity rating ‘Critical’ to ‘Informational’ per CVSS 4.0 and evaluated their potential impact. Each finding has been categorized in this report against the OWASP Top 10 (2021) framework, and severity ratings have been assigned using the CVSS v4.0 scoring mechanism to ensure accurate risk prioritization 

 

The application currently presents a high-risk security profile, primarily due to the presence of multiple Critical and High-Severity issues. These findings highlight weaknesses in access control, session management, input validation, Identification and Authentication Failures, and secure configuration. If not remediated, these vulnerabilities could result in unauthorized access, account takeover, data leaks, or compromise of the underlying infrastructure. 

 

By prioritizing the resolution of Broken Access Control as a universal vulnerability, alongside other Critical and High-severity issues, SAAL can substantially reduce the likelihood of exploitation, safeguard sensitive data, and strengthen its overall security posture. 

 

It is important to note that some vulnerabilities may have more instances throughout the application across user accounts, other than the ones already mentioned in this report. If a type of field or parameter is vulnerable and that same field/parameter is ubiquitously used across the application, or even if it is present at more than one location, the same patch must be applied for every single instance, barring no exception. 

 

SDET Tech strongly recommends that all the issues identified in this report be addressed as soon as possible, and must see a global fix (no spot fixes) without any exceptions. SDET Tech will conduct a follow-on review to ensure compliance during the second round of testing. 




need to change heading name 5. Technical Summary (OWASP Top 10) --> Application Health Status Vis-à-Vis Latest OWASP TOP 10 (2025)






Our Methodology 

 

    Information Gathering 

    Collected details about the platform’s structure, technologies used, and exposed endpoints. 

    Mapped user roles, workflows, and privilege levels (e.g., admin, commander, student etc.). 

    Threat Modelling & Role-Based Testing 

    Identified potential threats unique to the platform, such as unauthorized access to training records, assessment record, library records, misuse of analytics data, or manipulation of smart library content. 

    Tested role-based access control (RBAC) by verifying whether each user role was restricted to its intended permissions. 

    Vulnerability Assessment 

    Performed automated and manual scans to detect weaknesses such as misconfigurations, insecure session handling, and outdated components. 

    Focused specifically on critical areas: 

    Password reset functionality for account takeover. 

    File upload features for malicious payloads. 

    Analytics modules for unauthorized data access. 

    Smart library for information leakage and manipulation risks. 

    Exploitation & Proof-of-Concept 

    Safely attempted to exploit identified vulnerabilities to validate impact. 

    Demonstrated issues such as unauthorized password resets, privilege escalation between roles, sensitive data exposure, and server-side misconfigurations. 

    Impact Analysis 

    Assessed the real-world business and operational impact of each confirmed vulnerability. 

    Mapped risks to confidentiality, integrity, and availability of training data and force-related information. 

    Reporting 

    Documented all findings with Steps-by-Steps reproduction details, proof-of-concept evidence, and mapped them to CVSS v4.0 severity ratings. 

    Provided prioritized Remediations Steps for technical teams and strategic recommendations for management. 





    Test Methodology 

 

 

Round 1 – Initial Security Assessment 

1. Information Gathering 

    Collected detailed information about the C3 portal architecture, exposed endpoints, API structure, authentication mechanisms, and application workflows. 

    Identified publicly accessible resources, configuration endpoints, and administrative modules. 

    Mapped user roles and privilege levels (e.g., Partner Admin, Partner Reader, Reseller, Customer) to understand access boundaries and permission hierarchy. 

    Reviewed client-side storage mechanisms, token handling behaviour, and session management logic. 

2. Threat Modelling & Role-Based Testing 

    Identified potential threats specific to the platform, including: 

    Unauthorized administrative actions 

    Privilege escalation between roles 

    Business logic manipulation 

    API abuse and hidden endpoint exposure 

    Banner notification misuse affecting multiple user entities 

    Performed in-depth Role-Based Access Control (RBAC) validation to verify whether each user role was properly restricted to its intended permissions. 

    Tested enforcement of authorization checks at both UI and API levels to identify server-side validation gaps. 

    Assessed impact of unauthorized actions across cross-entity and multi-tenant scenarios. 

3. Vulnerability Assessment 

    Conducted both automated and manual security testing to identify weaknesses such as: 

    Broken Access Control 

    Business logic flaws 

    Improper JWT validation 

    Unauthenticated API access 

    Hidden administrative endpoints 

    Injection vulnerabilities 

    File upload validation weaknesses 

    Security misconfigurations 

    Verbose error disclosure 

    Focused specifically on high-risk areas: 

    Administrative configuration settings 

    Bundle management APIs 

    Banner notification functionality (including scheduling logic) 

    Coupon management modules 

    Token validation and authentication flows 

    File upload mechanisms 

    Client-side storage practices 

4. Exploitation & Proof-of-Concept Validation 

    Safely attempted controlled exploitation of identified vulnerabilities to validate their real-world impact. 

    Used interception tools to manipulate requests and bypass client-side validation controls. 

    Unauthorized modification of global administrative settings 

    Unauthorized deletion of bundles via API 

    Banner management and scheduling bypass 

    Access to hidden or unauthenticated endpoints 

    Business logic bypass through request tampering 

    HTML injection behaviour 

    Malicious file upload acceptance 

    Ensured that exploitation attempts were performed in a controlled manner without disrupting production stability. 

5. Impact Analysis 

    Assessed each confirmed vulnerability based on its potential impact on: 

    Confidentiality (unauthorized data access) 

    Integrity (unauthorized modification of configurations or data) 

    Availability (potential misuse affecting platform operations) 

    Evaluated risks in terms of privilege escalation, cross-entity impact, and administrative control compromise. 

    Assigned severity ratings using CVSS methodology to ensure standardized risk prioritization. 

6. Reporting 

    Documented all confirmed findings with: 

    Clear description of the vulnerability 

    Step-by-step reproduction procedure 

    Proof-of-concept evidence 

    Impact assessment 

    Severity classification 

    Mapped vulnerabilities to OWASP Top 10 categories. 

    Provided prioritized remediation recommendations focused on global corrective measures rather than isolated fixes. 

    Highlighted systemic issues requiring architectural improvements, particularly in access control and server-side validation enforcement. 

 

 

 

 

Retest – Revalidation / Retest 

Following remediation by the development team, a structured revalidation exercise was conducted to verify the effectiveness of implemented fixes. 

    Re-tested all previously reported vulnerabilities using the same attack scenarios and techniques. 

    Validated server-side authorization enforcement and RBAC corrections. 

    Verified API-level authentication and access restrictions. 

    Confirmed remediation of injection vectors, file upload controls, and error handling weaknesses. 

    Assessed residual risk and identified any remaining open findings. 

The revalidation round ensured that remediation measures were effective and consistently enforced across the application. 




Recommendation 

 

1. Standardization of Generic Error Messages (Information Disclosure Prevention) 

To minimize information leakage and reduce attacker reconnaissance opportunities, the application should standardize error handling across all endpoints. 

Currently, distinct error messages such as “The page you are looking for doesn't exist or you do not have permissions to access the page.” or “Permission denied” may reveal the existence of protected resources or authorization logic to unauthorized users. This information can be leveraged by attackers to infer valid endpoints, roles, or access control mechanisms. 

Recommendation: 

    Implement uniform, generic error responses for all unauthorized, forbidden, or non-existent resources. 

    Return a single generic message (e.g., “The requested page does not exist”) regardless of whether the resource is missing or access is restricted. 

    Redirect authenticated but unauthorized users to a safe default location (such as the application dashboard) instead of exposing access-denied messages. 

    Ensure detailed error messages, stack traces, and authorization failure reasons are logged securely on the server side only. 

    Apply consistent HTTP status codes while keeping client-facing messages intentionally vague. 

    Enforce this behaviour across all application layers, including APIs, administrative endpoints, and hidden or legacy routes. 

Adopting generic error messaging is a security best practice that limits information disclosure and prevents attackers from gaining insights into application structure, access control logic, or protected functionality. 

 

 

Project Name 
	

C3 kpnsandbox 

 

 

 

Description 
	

To evaluate the security posture of the C3 Portal hosted in the kpnsandbox environment by simulating realistic attack scenarios under a gray-box testing approach. The objective was to identify exploitable vulnerabilities related to broken access control, authentication and authorization weaknesses, business logic flaws, insecure API exposure, and input validation gaps, enabling prioritized remediation to reduce overall business and operational risk. 

   

   Scope 
	

   

https://kpnsandbox.cspcontrolcenter.net/  

   

   Type  
	

  

Web Application 

Credentials 
	

 Yes 

Test Scope 
	

 VAPT Retest 



