# CAMPD Data Manager, Phase #1 , Created by Lisa Hendricks and James Roberts
This project aims to offer a service which can host, sort, and visualize Clean Air Markets Program Data (CAMPD) provided by the Environmental Protection Agency (EPA).

## Description
This project aims to design, implement, test, and deploy a database-driven web application which stores CAMPD data. The application supports the collection, storage, and management of CAMPD data provided by the U.S Environment Protection Agency.
    
    The website features 5 pages: A home index, Data Retrieval, Explore Data, Upload Data, Download Data, and Facility. Each page has its own search functionality, exluding the index page. 
    
    Each page has the following features:
    #1.  The index page features a short, informative biography of CAMPD 
            data. Along with this is a table of data which shares information regarding all of the uploaded data sets.
    #2.   The data retrieval page features a variety of filters, a basic 
            search function, and an advanced search function. The filters may restrict the data by specifications such as: Date, Facility Name, ID, and Fuel Type. These filters can be combined, and reset using the "Clear Filters" button. The basic search allows the user to type in keywords such as "Barry" or a numeric emission mass. This search can also combine keywords, allowing the user to search for multiple key values at once. Lastly, there is the assisted search function. This feature utilizes an API key to connect to a LLM service. The user may type a vague search, such as "Find coal units in Kentucky with high CO2 emissions.", and recieve a result.
    #3.   The upload page allows a user to upload either a .csv or .xlsx file 
            as input, which can be managed within the website.
    #4.   The download page allows a user to download data from the website 
            as either a .csv or .xlsx file. Along with this, there is a table which allows the user to download data from specific data sets rather than the entire website.
    #5.   The final page is the Facilities page. The facilities page features 
            a small description of EPA facilities, along with information regarding two highlighted facilities. The user may search facilities installed. 

## Prerequisites
This project relies on the following libraries/dependencies to run:
    - Node.js
    - a local connection to MySQL
    - Google Generative API 

## Installation
UNFINISHED <---------------------------------------

## Usage
This project may be used in a variety of ways, for example: 
UNFINISHED <---------------------------------------



## Contribution
This project was developed by Lisa Hendricks and James Roberts for Dr. Xia's 396-002 Intermediate Software Projct class. Each team member's contribution has been logged within our GitHub. Attached is the link to our project GitHub:

    https://github.com/JimboManiaa/EPA-CS-396-James-and-Lisa-
