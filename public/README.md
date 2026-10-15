# 🔍 SEO Performance Monitoring System

**Analyze website SEO factors, identify optimization issues, and discover opportunities to improve webpage content.**

A web-based SEO auditing application that examines accessible webpage HTML, evaluates important on-page SEO elements, and presents a score with recommendations using predefined rules.

## 📌 Project Overview

The **SEO Performance Monitoring System** is designed to simplify basic on-page Search Engine Optimization (SEO) analysis. Users can submit a website URL and review important webpage elements that may require optimization.

The application combines frontend development, backend processing, HTML parsing, and database management to transform webpage information into understandable SEO insights.

This project demonstrates the practical use of web technologies for website analysis and digital content optimization.

## ✨ Key Features

- **URL-Based Analysis:** Submit a website URL for analysis.
- **Title Tag Analysis:** Check whether the webpage contains a title.
- **Meta Description Analysis:** Identify missing or incomplete meta descriptions.
- **Heading Analysis:** Examine heading tags and webpage content structure.
- **Image Alt-Text Analysis:** Identify images that lack alternative text.
- **Keyword Analysis:** Examine keyword usage within accessible webpage text, where implemented.
- **SEO Score:** Generate a rule-based score from the checks supported by the application.
- **Actionable Recommendations:** Highlight common issues and suggest possible improvements.
- **Database Support:** Use MySQL for relevant records and analysis history, where implemented.

*Note: Features listed above should match the functionality available in the current version of the application.*

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Structures the web interface |
| CSS3 | Styles the application |
| JavaScript | Handles frontend interactions |
| Node.js | Runs the server-side JavaScript |
| Express.js | Handles backend requests and application routing |
| Cheerio | Parses HTML and extracts webpage elements |
| MySQL | Stores relevant application data |
| mysql2 | Connects the Node.js application to MySQL |
| dotenv | Loads configuration from environment variables |
| Git and GitHub | Version control and source-code hosting |

## 🏗️ System Architecture

The application follows a modular client-server architecture.

```text
              USER
                |
                v
       FRONTEND INTERFACE
       HTML, CSS, JavaScript
                |
                v
        NODE.JS + EXPRESS
         Backend Server
                |
                v
      WEBPAGE CONTENT FETCH
                |
                v
       HTML PARSING (CHEERIO)
                |
                v
        SEO ANALYSIS MODULE
       /        |         \
   Titles    Metadata    Headings
       \        |         /
                v
       SEO SCORE + SUGGESTIONS
                |
                v
          RESULTS DISPLAY

     MySQL Database
     Relevant Records
```

## 🔄 How It Works

1. The user enters a website URL.
2. The backend receives and validates the request.
3. The application attempts to retrieve accessible webpage HTML.
4. Cheerio parses the HTML and extracts relevant SEO elements.
5. The analysis module evaluates the extracted information against predefined rules.
6. The system generates a score and recommendations based on the implemented checks.
7. Results are displayed to the user, and relevant records can be stored in MySQL.

## 📁 Project Structure

```text
seo-mini-simple/
│
├── public/
│   ├── index.html       # Frontend structure
│   ├── style.css        # Application styling
│   └── script.js        # Frontend interactions
│
├── server.js            # Backend server
├── db.js                # Database connection
├── package.json         # Dependencies and scripts
├── .env                 # Local environment configuration
├── .gitignore           # Files excluded from Git
└── README.md            # Project documentation
```

## ⚙️ Installation and Setup

### Prerequisites

Install the following before running the application:

- [Node.js](https://nodejs.org/)
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/)
- [Git](https://git-scm.com/)
- A code editor such as [Visual Studio Code](https://code.visualstudio.com/)

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/seo-performance-monitor.git
cd seo-performance-monitor
```

Replace `YOUR-USERNAME` with your GitHub username.

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a local `.env` file in the project root and add the database settings required by your application.

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_local_password
DB_NAME=your_database_name
```

Use the actual variable names and database name expected by your existing `db.js` and application code. Do not commit real passwords or other secrets to GitHub.

### Step 4: Configure the Database

Start MySQL and create the database required by the application. If the project includes an SQL schema, import it before starting the server.

### Step 5: Start the Application

If `package.json` defines a suitable start script:

```bash
npm start
```

Otherwise, if `server.js` is the application entry point:

```bash
node server.js
```

Open the local URL and port printed by the server in your terminal.

## 🧪 Testing

Test the application with different scenarios:

- A valid, publicly accessible website URL.
- An invalid URL.
- A website that cannot be accessed.
- A webpage with missing title or meta description tags.
- A webpage containing images with missing alternative text.
- A webpage with different heading structures.

The expected result depends on the checks and error handling implemented in the current version.

## ⚠️ Limitations

- Some websites block automated requests or require authentication.
- Dynamically rendered webpages may not expose all their content through a simple HTML request.
- The SEO score is generated from application-defined rules and is not an official Google score.
- The application does not independently measure Google rankings, search impressions, clicks, or actual website traffic without integration with suitable external services.
- Analysis results depend on the webpage content that the application can successfully retrieve.

## 🚀 Future Enhancements

- Integration with Google Search Console APIs.
- Historical SEO reports and score comparisons.
- Scheduled website audits.
- Detailed charts and downloadable reports.
- Advanced keyword and content analysis.
- Multi-page website crawling.
- Improved handling of inaccessible URLs and dynamic content.
- User authentication and personalized dashboards.

## 🎯 Learning Outcomes

This project demonstrates practical experience with:

- Frontend and backend web development.
- REST-style request and response handling.
- HTML parsing and webpage data extraction.
- Rule-based analysis and recommendation generation.
- Database connectivity and configuration management.
- Software documentation, testing, and Git-based version control.

## 👨‍💻 Author

**Aryan Mishra**

B.Tech — Computer Science and Business Systems (CSBS)

Bharati Vidyapeeth Department of Engineering & Technology, Navi Mumbai

## 📄 License

A license has not yet been selected for this project. Add a `LICENSE` file if you decide to publish the source code under an open-source license.

---

**If you find this project useful, consider starring the repository!**